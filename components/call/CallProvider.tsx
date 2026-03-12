"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { toast } from "@/stores/toast";
import { resolveUserLabel } from "@/lib/users";

type IceServer = { urls: string[] | string; username?: string; credential?: string };

type CallState =
  | { kind: "idle" }
  | {
      kind: "incoming";
      from: string;
      fromLabel: string;
      callId: string;
      media: "audio" | "video";
      offer: RTCSessionDescriptionInit;
    }
  | { kind: "outgoing"; to: string; toLabel: string; callId: string; media: "audio" | "video" }
  | {
      kind: "inCall";
      peer: string;
      peerLabel: string;
      callId: string;
      media: "audio" | "video";
      localStream: MediaStream;
      remoteStream: MediaStream;
    };

type CallContextValue = {
  state: CallState;
  startCall: (toUserId: string, media: "audio" | "video") => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
};

const Ctx = createContext<CallContextValue | null>(null);

export function useCall() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used within CallProvider");
  return v;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>({ kind: "idle" });
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const cleanup = () => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setMicEnabled(true);
    setCamEnabled(true);
    setState({ kind: "idle" });
  };

  const ensurePC = async (peerId: string, callId: string) => {
    const ice = await apiFetch<{ ok: true; iceServers: IceServer[] }>("/api/rtc/ice-servers");
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    pcRef.current = pc;

    const remote = new MediaStream();
    remoteStreamRef.current = remote;

    pc.ontrack = (ev) => {
      if (ev.track) remote.addTrack(ev.track);
      setState((prev) =>
        prev.kind === "inCall" ? { ...prev, remoteStream: remote } : prev,
      );
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socketRef.current?.emit("call:ice-candidate", {
        to: peerId,
        callId,
        candidate: ev.candidate,
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        cleanup();
      }
    };

    // Flush ICE that arrived early
    for (const c of pendingIce.current.splice(0)) {
      try {
        void pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }

    return pc;
  };

  const getMedia = async (media: "audio" | "video") => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: media === "video" });
    localStreamRef.current = stream;
    setMicEnabled(true);
    setCamEnabled(media === "video");
    return stream;
  };

  const startCall = async (toUserId: string, media: "audio" | "video") => {
    if (state.kind !== "idle") return;
    const callId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toLabel = (await resolveUserLabel(toUserId)) ?? toUserId;
    setState({ kind: "outgoing", to: toUserId, toLabel, callId, media });

    try {
      const s = getSocket();
      socketRef.current = s;

      const stream = await getMedia(media);
      const pc = await ensurePC(toUserId, callId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      s.emit("call:offer", { to: toUserId, callId, media, offer }, (ack: any) => {
        if (!ack?.ok) {
          toast({ title: "Call failed", message: "Could not reach the other side." });
          cleanup();
        }
      });
    } catch {
      toast({ title: "Call failed", message: "Mic/camera permission was denied." });
      cleanup();
    }
  };

  const accept = async () => {
    if (state.kind !== "incoming") return;
    const { from, callId, offer, media } = state;
    const s = getSocket();
    socketRef.current = s;

    try {
      const stream = await getMedia(media);
      const pc = await ensurePC(from, callId);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      s.emit("call:answer", { to: from, callId, answer }, (ack: any) => {
        if (!ack?.ok) cleanup();
      });

      setState({
        kind: "inCall",
        peer: from,
        peerLabel: state.fromLabel,
        callId,
        media,
        localStream: stream,
        remoteStream: remoteStreamRef.current ?? new MediaStream(),
      });
    } catch {
      s.emit("call:end", { to: from, callId, reason: "media_denied" });
      toast({ title: "Cannot answer", message: "Mic/camera permission was denied." });
      cleanup();
    }
  };

  const decline = async () => {
    if (state.kind !== "incoming") return;
    const s = getSocket();
    s.emit("call:end", { to: state.from, callId: state.callId, reason: "declined" });
    cleanup();
  };

  const hangup = async () => {
    if (state.kind === "idle") return;
    const s = getSocket();
    const peer =
      state.kind === "incoming"
        ? state.from
        : state.kind === "outgoing"
          ? state.to
          : state.peer;
    const callId = state.callId;
    s.emit("call:end", { to: peer, callId, reason: "hangup" });
    cleanup();
  };

  const toggleMic = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micEnabled;
    for (const t of s.getAudioTracks()) t.enabled = next;
    setMicEnabled(next);
  };

  const toggleCam = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camEnabled;
    for (const t of s.getVideoTracks()) t.enabled = next;
    setCamEnabled(next);
  };

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const onOffer = async (p: any) => {
      if (state.kind !== "idle") return;
      const from = String(p.from);
      const fromLabel = (await resolveUserLabel(from)) ?? from;
      setState({
        kind: "incoming",
        from,
        fromLabel,
        callId: p.callId,
        media: p.media === "audio" ? "audio" : "video",
        offer: p.offer,
      });
      toast({ title: "Incoming call", message: `From ${fromLabel}` });
    };

    const onAnswer = async (p: any) => {
      if (state.kind !== "outgoing") return;
      if (p.callId !== state.callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(p.answer);
      const local = localStreamRef.current;
      setState({
        kind: "inCall",
        peer: state.to,
        peerLabel: state.toLabel,
        callId: state.callId,
        media: state.media,
        localStream: local ?? new MediaStream(),
        remoteStream: remoteStreamRef.current ?? new MediaStream(),
      });
    };

    const onIce = async (p: any) => {
      const pc = pcRef.current;
      if (!pc) {
        if (p?.candidate) pendingIce.current.push(p.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(p.candidate);
      } catch {
        // ignore
      }
    };

    const onEnd = (p: any) => {
      if (state.kind === "idle") return;
      if (p.callId && state.callId && p.callId !== state.callId) return;
      cleanup();
    };

    const onMissed = (p: any) => {
      if (state.kind === "idle") {
        const from = String(p.from);
        void resolveUserLabel(from).then((label) => {
          toast({ title: "Missed call", message: `From ${label ?? from}` });
        });
        return;
      }
      if (p.callId && p.callId === (state as any).callId) cleanup();
    };

    s.on("call:offer", onOffer);
    s.on("call:answer", onAnswer);
    s.on("call:ice-candidate", onIce);
    s.on("call:end", onEnd);
    s.on("call:missed", onMissed);

    return () => {
      s.off("call:offer", onOffer);
      s.off("call:answer", onAnswer);
      s.off("call:ice-candidate", onIce);
      s.off("call:end", onEnd);
      s.off("call:missed", onMissed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startCall,
      accept,
      decline,
      hangup,
      toggleMic,
      toggleCam,
      micEnabled,
      camEnabled,
    }),
    [state, micEnabled, camEnabled],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
