"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { toast } from "@/stores/toast";
import { resolveUserLabel } from "@/lib/users";

type IceServer = {
  urls: string[] | string;
  username?: string;
  credential?: string;
};

function inferMediaFromOffer(
  offer: RTCSessionDescriptionInit,
): "audio" | "video" {
  const sdp = typeof offer?.sdp === "string" ? offer.sdp : "";
  // If we didn't add a video track, the offer SDP typically has no m=video section.
  return /\r?\nm=video\s/.test(sdp) ? "video" : "audio";
}

type CallOfferAck = { ok: boolean; callId?: string };
type CallSimpleAck = { ok: boolean };
type CallQualityProfile = "low" | "medium" | "high";
type CallNetworkQuality = {
  profile: CallQualityProfile;
  label: string;
  bitrateKbps: number | null;
  rttMs: number | null;
  packetLossPct: number | null;
};

type NavigatorConnection = {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

const QUALITY_PRESETS: Record<
  CallQualityProfile,
  {
    label: string;
    width: number;
    height: number;
    frameRate: number;
    maxBitrate: number;
  }
> = {
  low: {
    label: "Low bandwidth",
    width: 480,
    height: 270,
    frameRate: 12,
    maxBitrate: 250_000,
  },
  medium: {
    label: "Balanced",
    width: 640,
    height: 360,
    frameRate: 20,
    maxBitrate: 700_000,
  },
  high: {
    label: "HD",
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 1_500_000,
  },
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

function getConnectionInfo() {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: NavigatorConnection };
  return nav.connection ?? null;
}

function pickInitialQuality(): CallQualityProfile {
  const connection = getConnectionInfo();
  const effectiveType = connection?.effectiveType;
  const downlink = connection?.downlink ?? 0;

  if (effectiveType === "slow-2g" || effectiveType === "2g") return "low";
  if (effectiveType === "3g") return "medium";
  if (downlink > 0 && downlink < 1.2) return "low";
  if (downlink > 0 && downlink < 3) return "medium";
  return "high";
}

function buildQualityState(
  profile: CallQualityProfile,
  stats?: Partial<Omit<CallNetworkQuality, "profile" | "label">>,
): CallNetworkQuality {
  return {
    profile,
    label: QUALITY_PRESETS[profile].label,
    bitrateKbps: stats?.bitrateKbps ?? null,
    rttMs: stats?.rttMs ?? null,
    packetLossPct: stats?.packetLossPct ?? null,
  };
}

async function applyVideoQualityProfile(
  pc: RTCPeerConnection | null,
  stream: MediaStream | null,
  profile: CallQualityProfile,
) {
  if (!pc || !stream) return;

  const preset = QUALITY_PRESETS[profile];
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return;

  try {
    await videoTrack.applyConstraints({
      width: { ideal: preset.width, max: preset.width },
      height: { ideal: preset.height, max: preset.height },
      frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    });
  } catch {
    // Some cameras reject dynamic constraints. Sender parameters still help.
  }

  const sender = pc.getSenders().find((item) => item.track?.kind === "video");
  if (!sender) return;

  try {
    const params = sender.getParameters();
    const nextEncoding = {
      ...(params.encodings?.[0] ?? {}),
      maxBitrate: preset.maxBitrate,
      maxFramerate: preset.frameRate,
      scaleResolutionDownBy:
        profile === "high" ? 1 : profile === "medium" ? 1.5 : 2.5,
    };
    params.encodings = [nextEncoding];
    params.degradationPreference = "maintain-framerate";
    await sender.setParameters(params);
  } catch {
    // Keep the call alive even if the browser does not support all sender knobs.
  }
}

function chooseQualityProfile({
  bitrateKbps,
  rttMs,
  packetLossPct,
}: {
  bitrateKbps: number | null;
  rttMs: number | null;
  packetLossPct: number | null;
}): CallQualityProfile {
  const baseline = pickInitialQuality();

  if (
    (bitrateKbps != null && bitrateKbps < 250) ||
    (rttMs != null && rttMs > 650) ||
    (packetLossPct != null && packetLossPct > 12)
  ) {
    return "low";
  }

  if (
    (bitrateKbps != null && bitrateKbps < 900) ||
    (rttMs != null && rttMs > 320) ||
    (packetLossPct != null && packetLossPct > 5)
  ) {
    return baseline === "low" ? "low" : "medium";
  }

  return baseline;
}

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
  | {
      kind: "outgoing";
      to: string;
      toLabel: string;
      callId: string;
      media: "audio" | "video";
    }
  | {
      kind: "inCall";
      peer: string;
      peerLabel: string;
      callId: string;
      media: "audio" | "video";
      connectedAt: string;
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
  networkQuality: CallNetworkQuality;
};

const Ctx = createContext<CallContextValue | null>(null);

function mediaErrorMessage(err: unknown, media: "audio" | "video") {
  const secureHint = !window.isSecureContext
    ? " Use https or http://localhost so the browser can ask for permissions."
    : "";

  const base = media === "audio" ? "Microphone" : "Mic/camera";

  const name = (() => {
    if (err instanceof DOMException) return err.name;
    const r = asRecord(err);
    const n = r?.name;
    return typeof n === "string" ? n : "";
  })();

  if (name === "NotAllowedError" || name === "SecurityError") {
    return `${base} permission was denied.${secureHint}`;
  }
  if (name === "NotFoundError") {
    return media === "audio"
      ? "No microphone was found."
      : "No camera or microphone was found.";
  }
  if (name === "NotReadableError") {
    return `${base} is already in use by another app.`;
  }

  return `Could not access ${base.toLowerCase()}.${secureHint}`;
}

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
  const networkIntervalRef = useRef<number | null>(null);
  const lastVideoStatsRef = useRef<{
    bytesSent: number;
    timestamp: number;
    packetsSent: number;
    packetsLost: number;
  } | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<CallNetworkQuality>(() =>
    buildQualityState(pickInitialQuality()),
  );
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);

  const stopNetworkMonitor = () => {
    if (networkIntervalRef.current != null) {
      window.clearInterval(networkIntervalRef.current);
      networkIntervalRef.current = null;
    }
    lastVideoStatsRef.current = null;
  };

  const cleanup = () => {
    stopNetworkMonitor();
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setMicEnabled(true);
    setCamEnabled(true);
    setNetworkQuality(buildQualityState(pickInitialQuality()));
    setState({ kind: "idle" });
  };

  const ensurePC = async (peerId: string, callId: string) => {
    const ice = await apiFetch<{ ok: true; iceServers: IceServer[] }>(
      "/api/rtc/ice-servers",
    );
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
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
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
    const initialQuality = pickInitialQuality();
    const preset = QUALITY_PRESETS[initialQuality];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        media === "video"
          ? {
              width: { ideal: preset.width, max: preset.width },
              height: { ideal: preset.height, max: preset.height },
              frameRate: { ideal: preset.frameRate, max: preset.frameRate },
            }
          : false,
    });
    localStreamRef.current = stream;
    setMicEnabled(true);
    setCamEnabled(media === "video");
    setNetworkQuality(buildQualityState(initialQuality));
    return stream;
  };

  const refreshNetworkQuality = async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || stream.getVideoTracks().length === 0) return;

    let bytesSent: number | null = null;
    let packetsSent: number | null = null;
    let packetsLost: number | null = null;
    let rttMs: number | null = null;

    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (
        report.type === "outbound-rtp" &&
        report.kind === "video" &&
        !report.isRemote
      ) {
        bytesSent =
          typeof report.bytesSent === "number" ? report.bytesSent : bytesSent;
        packetsSent =
          typeof report.packetsSent === "number"
            ? report.packetsSent
            : packetsSent;
      }
      if (report.type === "remote-inbound-rtp" && report.kind === "video") {
        packetsLost =
          typeof report.packetsLost === "number"
            ? report.packetsLost
            : packetsLost;
        rttMs =
          typeof report.roundTripTime === "number"
            ? Math.round(report.roundTripTime * 1000)
            : rttMs;
      }
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        rttMs == null
      ) {
        rttMs =
          typeof report.currentRoundTripTime === "number"
            ? Math.round(report.currentRoundTripTime * 1000)
            : rttMs;
      }
    });

    let bitrateKbps: number | null = null;
    let packetLossPct: number | null = null;
    const now = Date.now();
    const previous = lastVideoStatsRef.current;
    if (previous && bytesSent != null && now > previous.timestamp) {
      bitrateKbps = Math.max(
        0,
        Math.round(
          ((bytesSent - previous.bytesSent) * 8) / (now - previous.timestamp),
        ),
      );
    }
    if (
      previous &&
      packetsSent != null &&
      packetsLost != null &&
      packetsSent >= previous.packetsSent &&
      packetsLost >= previous.packetsLost
    ) {
      const sentDelta = packetsSent - previous.packetsSent;
      const lostDelta = packetsLost - previous.packetsLost;
      const total = sentDelta + lostDelta;
      packetLossPct =
        total > 0 ? Number(((lostDelta / total) * 100).toFixed(1)) : 0;
    }

    if (bytesSent != null && packetsSent != null) {
      lastVideoStatsRef.current = {
        bytesSent,
        timestamp: now,
        packetsSent,
        packetsLost: packetsLost ?? previous?.packetsLost ?? 0,
      };
    }

    const profile = chooseQualityProfile({ bitrateKbps, rttMs, packetLossPct });
    await applyVideoQualityProfile(pc, stream, profile);
    setNetworkQuality(
      buildQualityState(profile, { bitrateKbps, rttMs, packetLossPct }),
    );
  };

  const startNetworkMonitor = () => {
    stopNetworkMonitor();
    if (!localStreamRef.current?.getVideoTracks().length) {
      setNetworkQuality(buildQualityState(pickInitialQuality()));
      return;
    }

    void refreshNetworkQuality();
    networkIntervalRef.current = window.setInterval(() => {
      void refreshNetworkQuality();
    }, 5000);
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
      await applyVideoQualityProfile(pc, stream, networkQuality.profile);
      startNetworkMonitor();

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: media === "video",
      });
      await pc.setLocalDescription(offer);

      s.emit(
        "call:offer",
        { to: toUserId, callId, offer, media },
        (ack?: CallOfferAck) => {
          if (!ack?.ok) {
            toast({
              title: "Call failed",
              message: "Could not reach the other side.",
            });
            cleanup();
          }
        },
      );
    } catch (err) {
      toast({ title: "Call failed", message: mediaErrorMessage(err, media) });
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
      await applyVideoQualityProfile(pc, stream, networkQuality.profile);
      startNetworkMonitor();

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      s.emit(
        "call:answer",
        { to: from, callId, answer },
        (ack?: CallSimpleAck) => {
          if (!ack?.ok) cleanup();
        },
      );

      setState({
        kind: "inCall",
        peer: from,
        peerLabel: state.fromLabel,
        callId,
        media,
        connectedAt: new Date().toISOString(),
        localStream: stream,
        remoteStream: remoteStreamRef.current ?? new MediaStream(),
      });
    } catch (err) {
      s.emit("call:end", { to: from, callId, reason: "media_denied" });
      toast({ title: "Cannot answer", message: mediaErrorMessage(err, media) });
      cleanup();
    }
  };

  const decline = async () => {
    if (state.kind !== "incoming") return;
    const s = getSocket();
    s.emit("call:end", {
      to: state.from,
      callId: state.callId,
      reason: "declined",
    });
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
    if (next) startNetworkMonitor();
    else stopNetworkMonitor();
  };

  useEffect(() => {
    const connection = getConnectionInfo();
    if (!connection?.addEventListener) return;

    const syncConnection = () => {
      const profile = pickInitialQuality();
      setNetworkQuality((prev) =>
        prev.profile === profile &&
        prev.bitrateKbps == null &&
        prev.rttMs == null &&
        prev.packetLossPct == null
          ? prev
          : buildQualityState(profile, {
              bitrateKbps: prev.bitrateKbps,
              rttMs: prev.rttMs,
              packetLossPct: prev.packetLossPct,
            }),
      );
      void applyVideoQualityProfile(
        pcRef.current,
        localStreamRef.current,
        profile,
      );
    };

    connection.addEventListener("change", syncConnection);
    return () => connection.removeEventListener?.("change", syncConnection);
  }, []);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const onOffer = async (p: unknown) => {
      if (state.kind !== "idle") return;
      const r = asRecord(p);
      if (!r) return;
      const from = r.from == null ? "" : String(r.from);
      if (!from) return;
      const fromLabel = (await resolveUserLabel(from)) ?? from;
      const offer = r.offer as RTCSessionDescriptionInit;
      const inferred = inferMediaFromOffer(offer);
      const media =
        r.media === "audio" || r.media === "video" ? r.media : inferred;
      const callId = typeof r.callId === "string" ? r.callId : "";
      if (!callId) return;
      setState({
        kind: "incoming",
        from,
        fromLabel,
        callId,
        media,
        offer,
      });
      toast({ title: "Incoming call", message: `From ${fromLabel}` });
    };

    const onAnswer = async (p: unknown) => {
      if (state.kind !== "outgoing") return;
      const r = asRecord(p);
      if (!r) return;
      const callId = typeof r.callId === "string" ? r.callId : "";
      if (!callId || callId !== state.callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(r.answer as RTCSessionDescriptionInit);
      const local = localStreamRef.current;
      setState({
        kind: "inCall",
        peer: state.to,
        peerLabel: state.toLabel,
        callId: state.callId,
        media: state.media,
        connectedAt: new Date().toISOString(),
        localStream: local ?? new MediaStream(),
        remoteStream: remoteStreamRef.current ?? new MediaStream(),
      });
    };

    const onIce = async (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const pc = pcRef.current;
      if (!pc) {
        if (r.candidate)
          pendingIce.current.push(r.candidate as RTCIceCandidateInit);
        return;
      }
      try {
        await pc.addIceCandidate(r.candidate as RTCIceCandidateInit);
      } catch {
        // ignore
      }
    };

    const onEnd = (p: unknown) => {
      if (state.kind === "idle") return;
      const r = asRecord(p);
      const callId = typeof r?.callId === "string" ? r.callId : "";
      if (callId && callId !== state.callId) return;
      cleanup();
    };

    const onMissed = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (state.kind === "idle") {
        const from = r.from == null ? "" : String(r.from);
        if (!from) return;
        void resolveUserLabel(from).then((label) => {
          toast({ title: "Missed call", message: `From ${label ?? from}` });
        });
        return;
      }
      const callId = typeof r.callId === "string" ? r.callId : "";
      if (callId && callId === state.callId) cleanup();
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

  const value: CallContextValue = {
    state,
    startCall,
    accept,
    decline,
    hangup,
    toggleMic,
    toggleCam,
    micEnabled,
    camEnabled,
    networkQuality,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
