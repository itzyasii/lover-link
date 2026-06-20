"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { toast } from "@/stores/toast";
import { resolveUserLabel } from "@/lib/users";
import type { CallState } from "@/lib/utils";
import {
  playIncomingCallSound,
  stopCallSound,
  playCallEndSound,
} from "@/lib/sounds";

type CallOfferAck = { ok: boolean; callId?: string };
type CallSimpleAck = { ok: boolean };
type CallQualityProfile = "low" | "medium" | "high";

type CallNetworkQuality = {
  profile: CallQualityProfile;
  label: string;
  bitrateKbps?: number;
  rttMs?: number;
  packetLossPct?: number;
};

type NavigatorConnection = {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
};

type NavigatorWithConnection = Navigator & {
  connection?: NavigatorConnection;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

type OutputDevice = {
  deviceId: string;
  label: string;
};

type CallContextValue = {
  state: CallState;
  startCall: (toUserId: string, media: "audio" | "video") => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleSpeaker: () => void;
  switchOutputDevice: (deviceId: string) => Promise<void>;
  micEnabled: boolean;
  camEnabled: boolean;
  speakerEnabled: boolean;
  outputDevices: OutputDevice[];
  currentOutputDevice: string | null;
  networkQuality: CallNetworkQuality;
};

const Ctx = createContext<CallContextValue | null>(null);

export function useCall() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used within CallProvider");
  return v;
}

// Ice server type placeholder
type IceServer = { urls: string; username?: string; credential?: string };

const QUALITY_PRESETS: Record<
  CallQualityProfile,
  { width: number; height: number; frameRate: number }
> = {
  low: { width: 640, height: 480, frameRate: 24 },
  medium: { width: 1280, height: 720, frameRate: 30 },
  high: { width: 1920, height: 1080, frameRate: 30 },
};

function pickInitialQuality(): CallQualityProfile {
  if (typeof navigator === "undefined" || !("connection" in navigator))
    return "medium";
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) return "medium";
  if (
    connection.effectiveType === "2g" ||
    connection.effectiveType === "slow-2g"
  )
    return "low";
  if (connection.effectiveType === "3g") return "medium";
  return "high";
}

function buildQualityState(
  profile: CallQualityProfile,
  metrics?: Partial<CallNetworkQuality>,
): CallNetworkQuality {
  const profileLabels: Record<CallQualityProfile, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
  };
  return { profile, label: profileLabels[profile], ...metrics };
}

function chooseQualityProfile({
  bitrateKbps,
  rttMs,
  packetLossPct,
}: {
  bitrateKbps?: number;
  rttMs?: number;
  packetLossPct?: number;
}): CallQualityProfile {
  if (bitrateKbps != null && bitrateKbps < 300) return "low";
  if (bitrateKbps != null && bitrateKbps < 900) return "medium";
  if ((packetLossPct ?? 0) > 5 || (rttMs ?? 0) > 500) return "low";
  if ((packetLossPct ?? 0) > 2 || (rttMs ?? 0) > 300) return "medium";
  return "high";
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
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: preset.frameRate },
    });
  } catch {
    // Keep the call alive if the camera cannot satisfy an adaptive profile.
  }
}

function getConnectionInfo(): NavigatorConnection {
  if (typeof navigator === "undefined") return {};
  return (navigator as NavigatorWithConnection).connection || {};
}

function mediaErrorMessage(err: unknown, media: "audio" | "video"): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Permission is needed to use your ${media === "video" ? "camera and microphone" : "microphone"}.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return media === "video"
      ? "Could not find a camera and microphone for this call."
      : "Could not find a microphone for this call.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Your media device is already in use by another app.";
  }
  return "Could not access media devices.";
}

function inferMediaFromOffer(
  offer: RTCSessionDescriptionInit,
): "audio" | "video" {
  return typeof offer.sdp === "string" && /^m=video\s/m.test(offer.sdp)
    ? "video"
    : "audio";
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
  const [speakerEnabled, setSpeakerEnabled] = useState(false);
  const [outputDevices, setOutputDevices] = useState<OutputDevice[]>([]);
  const [currentOutputDevice, setCurrentOutputDevice] = useState<string | null>(
    null,
  );
  const [networkQuality, setNetworkQuality] = useState<CallNetworkQuality>(() =>
    buildQualityState(pickInitialQuality()),
  );
  const remoteAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const stateRef = useRef<CallState>(state);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
    if (remoteAudioElementRef.current) {
      remoteAudioElementRef.current.srcObject = null;
    }
    pendingIce.current = [];
    // Stop any ringing sounds
    stopCallSound();
    // Play call end sound if we were in an active call
    if (stateRef.current.kind === "inCall") {
      playCallEndSound();
    }
    setMicEnabled(true);
    setCamEnabled(true);
    setSpeakerEnabled(false);
    setCurrentOutputDevice(null);
    setNetworkQuality(buildQualityState(pickInitialQuality()));
    setState({ kind: "idle" });
  };

  useEffect(() => {
    cleanupRef.current = cleanup;
  });

  const flushPendingIce = async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // Ignore candidates that are no longer valid for this negotiation.
      }
    }
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
              width: { ideal: preset.width },
              height: { ideal: preset.height },
              frameRate: { ideal: preset.frameRate },
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

    let bytesSent: number | undefined;
    let packetsSent: number | undefined;
    let packetsLost: number | undefined;
    let rttMs: number | undefined;

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
    });

    const now = Date.now();
    const previous = lastVideoStatsRef.current;
    let bitrateKbps: number | undefined;
    let packetLossPct: number | undefined;

    if (previous && bytesSent != null) {
      const elapsedSeconds = Math.max(0.001, (now - previous.timestamp) / 1000);
      bitrateKbps = Math.max(
        0,
        Math.round(
          ((bytesSent - previous.bytesSent) * 8) / elapsedSeconds / 1000,
        ),
      );
    }
    if (
      previous &&
      packetsSent != null &&
      packetsLost != null &&
      packetsSent > previous.packetsSent
    ) {
      const sentDelta = packetsSent - previous.packetsSent;
      const lostDelta = Math.max(0, packetsLost - previous.packetsLost);
      packetLossPct =
        Math.round((lostDelta / (sentDelta + lostDelta)) * 1000) / 10;
    }

    if (bytesSent != null && packetsSent != null) {
      lastVideoStatsRef.current = {
        bytesSent,
        timestamp: now,
        packetsSent,
        packetsLost: packetsLost ?? previous?.packetsLost ?? 0,
      };
    }

    const profile = chooseQualityProfile({
      bitrateKbps,
      rttMs,
      packetLossPct,
    });
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
    // eslint-disable-next-line react-hooks/purity -- this is an event handler, not called during render
    const callId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toLabel = (await resolveUserLabel(toUserId)) ?? toUserId;
    setState({
      kind: "outgoing",
      to: toUserId,
      toLabel,
      callId,
      media,
      mediaStream: undefined,
    });

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
          } else {
            // If the call is answered and we enter inCall state, we'll load devices there
            // For now, we can load devices as soon as media is accessed
            void loadOutputDevices();
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
      await flushPendingIce();
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
        mediaStream: stream,
      });
      void loadOutputDevices();
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

  const loadOutputDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.slice(0, 5)}`,
        }));
      setOutputDevices(audioOutputs);
    } catch (err) {
      console.error("Failed to enumerate audio output devices:", err);
    }
  };

  const toggleSpeaker = () => {
    const next = !speakerEnabled;
    setSpeakerEnabled(next);
    // Speaker mode typically means using the loudspeaker instead of earpiece,
    // on web we can adjust the audio element's behavior or volume accordingly
    if (remoteAudioElementRef.current) {
      if (next) {
        // Max volume for speaker mode
        remoteAudioElementRef.current.volume = 1.0;
      } else {
        // Lower volume for earpiece mode
        remoteAudioElementRef.current.volume = 0.6;
      }
    }
  };

  const switchOutputDevice = async (deviceId: string) => {
    if (!remoteAudioElementRef.current?.setSinkId) {
      toast({
        title: "Cannot switch device",
        message: "Your browser doesn't support audio output device switching.",
      });
      return;
    }
    try {
      await remoteAudioElementRef.current.setSinkId(deviceId);
      setCurrentOutputDevice(deviceId);
    } catch {
      toast({
        title: "Device switch failed",
        message: "Could not switch to the selected audio device.",
      });
    }
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
      if (stateRef.current.kind !== "idle") return;
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
        mediaStream: undefined,
      });
      toast({ title: "Incoming call", message: `From ${fromLabel}` });
      playIncomingCallSound();
    };

    const onAccepted = () => {
      stopIncomingCallSound();
    };

    const onAnswer = async (p: unknown) => {
      const current = stateRef.current;
      const r = asRecord(p);
      if (!r) return;
      const callId = typeof r.callId === "string" ? r.callId : "";

      // Only proceed if we have an active call with a matching callId
      if (current.kind === "idle") return;
      if (!callId || callId !== current.callId) return;

      // If we're in incoming state (another device answered the call), cleanup
      if (current.kind === "incoming") {
        cleanupRef.current?.();
        return;
      }

      // If we're in outgoing state, proceed with connecting the call
      if (current.kind !== "outgoing") return;

      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(r.answer as RTCSessionDescriptionInit);
      await flushPendingIce();
      const local = localStreamRef.current;
      setState({
        kind: "inCall",
        peer: current.to,
        peerLabel: current.toLabel,
        callId: current.callId,
        media: current.media,
        connectedAt: new Date().toISOString(),
        localStream: local ?? new MediaStream(),
        remoteStream: remoteStreamRef.current ?? new MediaStream(),
        mediaStream: local ?? new MediaStream(),
      });
    };

    const onIce = async (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const candidate = r.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc?.remoteDescription) {
        pendingIce.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    };

    const onEnd = (p: unknown) => {
      const current = stateRef.current;
      if (current.kind === "idle") return;
      const r = asRecord(p);
      const callId = typeof r?.callId === "string" ? r.callId : "";
      if (callId && callId !== current.callId) return;
      cleanupRef.current?.();
    };

    const onMissed = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const current = stateRef.current;
      if (current.kind === "idle") {
        const from = r.from == null ? "" : String(r.from);
        if (!from) return;
        void resolveUserLabel(from).then((label) => {
          toast({ title: "Missed call", message: `From ${label ?? from}` });
        });
        return;
      }
      const callId = typeof r.callId === "string" ? r.callId : "";
      if (callId && callId === current.callId) cleanupRef.current?.();
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
  }, []);

  const value: CallContextValue = {
    state,
    startCall,
    accept,
    decline,
    hangup,
    toggleMic,
    toggleCam,
    toggleSpeaker,
    switchOutputDevice,
    micEnabled,
    camEnabled,
    speakerEnabled,
    outputDevices,
    currentOutputDevice,
    networkQuality,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
