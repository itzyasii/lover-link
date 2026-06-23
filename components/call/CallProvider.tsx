"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
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
  overlayVisible: boolean;
  setOverlayVisible: (v: boolean) => void;
};

// Helper types
type IncomingState = Extract<CallState, { kind: "incoming" }>;

// Functions needed before usage
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

const Ctx = createContext<CallContextValue | null>(null);

export function useCall() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCall must be used within CallProvider");
  return v;
}

// Ice server type placeholder
type IceServer = { urls: string; username?: string; credential?: string };

// Updated Reaction type with optional createdAt
// Reaction type removed as unused
// type Reaction = {
//   emoji: string;
//   userId: string;
//   createdAt?: string;
//   user?: {
//     id: string;
//     username?: string;
//     email?: string;
//   };
// };

const QUALITY_PRESETS: Record<
  CallQualityProfile,
  { width: number; height: number; frameRate: number }
> = {
  low: { width: 640, height: 480, frameRate: 24 },
  medium: { width: 1280, height: 720, frameRate: 30 },
  high: { width: 1920, height: 1080, frameRate: 30 },
};

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

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>({ kind: "idle" });
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<CallState>(state);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const networkIntervalRef = useRef<number | null>(null);
  const lastVideoStatsRef = useRef<{
    bytesSent: number;
    timestamp: number;
    packetsSent: number;
    packetsLost: number;
  } | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
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
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const onAnswer = async (p: unknown) => {
    const r = asRecord(p);
    if (!r) return;
    const payloadCallId = typeof r.callId === "string" ? r.callId : "";
    if (
      stateRef.current.kind !== "outgoing" ||
      payloadCallId !== stateRef.current.callId
    )
      return;

    const currentState = stateRef.current as Extract<
      CallState,
      { kind: "outgoing" }
    >;

    try {
      const answer = r.answer as RTCSessionDescriptionInit;
      if (pcRef.current && answer) {
        await pcRef.current.setRemoteDescription(answer);
        await flushPendingIce();
      }

      // Ensure we have valid streams
      const localStream = localStreamRef.current;
      const remoteStream = remoteStreamRef.current;

      if (!localStream) {
        throw new Error("Local stream not found");
      }
      if (!remoteStream) {
        throw new Error("Remote stream not found");
      }

      setState({
        kind: "inCall",
        peer: currentState.to,
        peerLabel: currentState.toLabel,
        callId: payloadCallId,
        media: currentState.media,
        connectedAt: new Date().toISOString(),
        localStream: localStream,
        remoteStream: remoteStream,
        mediaStream: localStream,
      } as CallState);

      setOverlayVisible(false);
      void loadOutputDevices();
    } catch (err) {
      console.error("Failed to handle answer:", err);
      cleanupRef.current?.();
    }
  };

  const applyVideoQualityProfile = useCallback(
    async (
      pc: RTCPeerConnection | null,
      stream: MediaStream | null,
      profile: CallQualityProfile,
    ) => {
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
    },
    [],
  );

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
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
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
    setOverlayVisible(false);
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
    console.log(
      `[ensurePC] Creating peer connection for call ${callId} to ${peerId}`,
    );
    try {
      let iceServers: IceServer[];
      try {
        const ice = await apiFetch<{ ok: true; iceServers: IceServer[] }>(
          "/api/rtc/ice-servers",
        );
        iceServers = ice.iceServers;
        console.log(`[ensurePC] Got ICE servers from API:`, iceServers);
      } catch (iceErr) {
        console.warn(
          "[ensurePC] Failed to fetch ICE servers from API, using fallback:",
          iceErr,
        );
        // Fallback to public STUN servers if API fails
        iceServers = [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ];
      }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      console.log(`[ensurePC] RTCPeerConnection created`);

      const remote = new MediaStream();
      remoteStreamRef.current = remote;

      pc.ontrack = (ev) => {
        console.log(`[ensurePC] Received remote track: ${ev.track.kind}`);
        if (ev.track) {
          // Check if track is already in the stream to avoid duplicates
          const existingTracks = remote.getTracks();
          const trackExists = existingTracks.some((t) => t.id === ev.track.id);
          if (!trackExists) {
            remote.addTrack(ev.track);
          }
        }
        // Always update state regardless of current state to ensure stream is propagated
        setState((prev) => {
          if (prev.kind === "inCall") {
            return {
              ...prev,
              remoteStream: new MediaStream(remote.getTracks()),
            };
          }
          return prev;
        });
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        console.log(`[ensurePC] Generated ICE candidate, sending to peer`);
        socketRef.current?.emit("call:ice-candidate", {
          to: peerId,
          callId,
          candidate: ev.candidate,
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `[ensurePC] Connection state changed: ${pc.connectionState}`,
        );
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          console.log(`[ensurePC] Connection failed or closed, cleaning up`);
          cleanup();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `[ensurePC] ICE connection state: ${pc.iceConnectionState}`,
        );
      };

      return pc;
    } catch (err) {
      console.error(`[ensurePC] Failed to create peer connection:`, err);
      throw err;
    }
  };

  const getMedia = async (media: "audio" | "video") => {
    console.log(`[getMedia] Getting ${media} media stream`);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Media devices API not supported in this browser");
    }

    const initialQuality = pickInitialQuality();
    const preset = QUALITY_PRESETS[initialQuality];
    console.log(`[getMedia] Using quality preset: ${initialQuality}`, preset);

    const constraints = {
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
    };
    console.log(`[getMedia] Requesting media with constraints:`, constraints);

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log(`[getMedia] Successfully obtained media stream`);

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
    console.log(`[startCall] Attempting to start ${media} call to ${toUserId}`);
    if (state.kind !== "idle") {
      console.log(
        `[startCall] Cannot start call: current state is ${state.kind}`,
      );
      return;
    }
    const callId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    console.log(`[startCall] Generated callId: ${callId}`);

    const toLabel = (await resolveUserLabel(toUserId)) ?? toUserId;
    console.log(`[startCall] Resolved user label: ${toLabel}`);

    setState({
      kind: "outgoing",
      to: toUserId,
      toLabel,
      callId,
      media,
      mediaStream: undefined,
    } as CallState);
    setOverlayVisible(true);
    console.log(`[startCall] Set state to outgoing, overlay visible: true`);

    try {
      const s = getSocket();
      if (!s) {
        throw new Error("Socket connection not available");
      }
      socketRef.current = s;
      console.log(`[startCall] Socket connected: ${s.connected}`);

      // Ensure socket is connected before proceeding
      if (!s.connected) {
        console.log(
          `[startCall] Socket not connected, attempting to connect...`,
        );
        s.connect();
        // Wait longer for connection to establish (3s instead of 1s)
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!s.connected) {
          throw new Error(
            "Failed to establish socket connection. Please check your internet connection.",
          );
        }
        console.log(
          `[startCall] Socket connected successfully after reconnection attempt`,
        );
      }

      console.log(`[startCall] Requesting ${media} media access`);
      const stream = await getMedia(media);
      console.log(
        `[startCall] Got media stream, tracks:`,
        stream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled })),
      );

      const pc = await ensurePC(toUserId, callId);
      console.log(`[startCall] PeerConnection created`);

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
        console.log(`[startCall] Added ${track.kind} track to peer connection`);
      }

      await applyVideoQualityProfile(pc, stream, networkQuality.profile);
      startNetworkMonitor();
      console.log(`[startCall] Network monitoring started`);

      console.log(`[startCall] Creating SDP offer`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: media === "video",
      });
      console.log(`[startCall] Offer created, setting local description`);

      await pc.setLocalDescription(offer);
      console.log(`[startCall] Local description set, emitting call:offer`);

      // Wait for ICE gathering to complete before sending offer (fixes incomplete SDP)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", checkState);
          // Add timeout to prevent waiting forever (10s)
          setTimeout(resolve, 10000);
        }
      });

      // Get the updated local description after ICE gathering
      const finalOffer = pc.localDescription;
      if (!finalOffer) {
        throw new Error("Failed to create local description");
      }

      s.emit(
        "call:offer",
        { to: toUserId, callId, offer: finalOffer, media },
        (ack?: CallOfferAck) => {
          console.log(`[startCall] call:offer acknowledged:`, ack);
          if (!ack?.ok) {
            toast({
              title: "Call failed",
              message:
                "Could not reach the other side. Please check if they're online.",
            });
            cleanup();
          } else {
            void loadOutputDevices();
          }
        },
      );
    } catch (err) {
      console.error(`[startCall] Error starting call:`, err);
      const errorMessage = mediaErrorMessage(err, media);
      toast({ title: "Call failed", message: errorMessage });
      cleanup();
    }
  };

  const accept = async () => {
    if (state.kind !== "incoming") return;
    const { from, callId, offer, media } = state as IncomingState;
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

      // Wait for ICE gathering to complete before sending answer (fixes incomplete SDP)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", checkState);
          // Add timeout to prevent waiting forever (10s)
          setTimeout(resolve, 10000);
        }
      });

      // Get the updated local description after ICE gathering
      const finalAnswer = pc.localDescription;
      if (!finalAnswer) {
        throw new Error("Failed to create local description");
      }

      s.emit(
        "call:answer",
        { to: from, callId, answer: finalAnswer },
        (ack?: CallSimpleAck) => {
          if (!ack?.ok) cleanup();
        },
      );

      // Ensure we have valid streams
      const remoteStream = remoteStreamRef.current;
      if (!remoteStream) {
        throw new Error("Remote stream not initialized");
      }

      setState({
        kind: "inCall",
        peer: from,
        peerLabel: (state as IncomingState).fromLabel,
        callId,
        media,
        connectedAt: new Date().toISOString(),
        localStream: stream,
        remoteStream: remoteStream,
        mediaStream: stream,
      } as CallState);
      setOverlayVisible(false);
      void loadOutputDevices();
    } catch (err) {
      s.emit("call:end", { to: from, callId, reason: "media_denied" });
      toast({
        title: "Cannot answer",
        message: mediaErrorMessage(err, media),
      });
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
          : state.kind === "inCall"
            ? state.peer
            : "";
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

    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection) {
      connection.addEventListener?.("change", syncConnection);
      return () => connection.removeEventListener?.("change", syncConnection);
    }
  }, [applyVideoQualityProfile]);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    // Add connection event listeners for reconnection handling
    const handleDisconnect = () => {
      console.log("[Socket] Disconnected - attempting to reconnect...");
    };

    const handleReconnect = (attempts: number) => {
      console.log(
        `[Socket] Successfully reconnected after ${attempts} attempts`,
      );
      // If we were in a call, resend any pending ICE candidates and renegotiate if needed
      if (stateRef.current.kind === "inCall") {
        toast({
          title: "Connection restored",
          message: "Your internet connection has been restored.",
        });
        // We're in an active call since the reconnect handler is only attached during calls
        // TypeScript confirms stateRef.current.kind can never be "idle" here
        const activeState = stateRef.current as { callId: string };
        // If we have pending ICE candidates, resend them to the peer
        if (pendingIce.current.length > 0 && pcRef.current?.remoteDescription) {
          console.log(
            "[Socket] Resending pending ICE candidates after reconnect",
          );
          pendingIce.current.forEach(async (candidate) => {
            try {
              await pcRef.current?.addIceCandidate(candidate);
              s.emit("call:ice-candidate", {
                callId: activeState.callId,
                candidate,
              });
            } catch (err) {
              console.error("[Socket] Failed to resend ICE candidate:", err);
            }
          });
          pendingIce.current = [];
        }
        // If we have an active peer connection, trigger renegotiation
        if (pcRef.current && pcRef.current.signalingState !== "stable") {
          console.log("[Socket] Triggering call renegotiation after reconnect");
          s.emit("call:renegotiate", { callId: activeState.callId });
        }
      }
    };

    // Log all socket events for debugging
    const handleAnyEvent = (eventName: string, ...args: unknown[]) => {
      if (eventName.startsWith("call:")) {
        console.log(`[Socket] ${eventName}:`, args[0]);
      }
    };

    s.on("disconnect", handleDisconnect);
    s.on("reconnect", handleReconnect);
    s.onAny(handleAnyEvent);

    const onOffer = async (p: unknown) => {
      console.log("[onOffer] Received call offer:", p);
      if (stateRef.current.kind !== "idle") {
        console.log(
          `[onOffer] Cannot accept call, current state: ${stateRef.current.kind}`,
        );
        // Send busy signal back to caller
        const r = asRecord(p);
        if (r) {
          const from = r.from == null ? "" : String(r.from);
          const callId = typeof r.callId === "string" ? r.callId : "";
          if (from && callId) {
            const s = getSocket();
            s.emit("call:end", { to: from, callId, reason: "busy" });
          }
        }
        return;
      }
      const r = asRecord(p);
      if (!r) {
        console.log("[onOffer] Invalid offer payload");
        return;
      }
      const from = r.from == null ? "" : String(r.from);
      if (!from) {
        console.log("[onOffer] Invalid from user ID");
        return;
      }
      const fromLabel = (await resolveUserLabel(from)) ?? from;
      const offer = r.offer as RTCSessionDescriptionInit;
      const inferred = inferMediaFromOffer(offer);
      const media =
        r.media === "audio" || r.media === "video" ? r.media : inferred;
      const callId = typeof r.callId === "string" ? r.callId : "";
      if (!callId) {
        console.log("[onOffer] Invalid call ID");
        return;
      }
      console.log(
        `[onOffer] Setting up incoming ${media} call from ${fromLabel} (${from}) with callId: ${callId}`,
      );
      setState({
        kind: "incoming",
        from,
        fromLabel,
        callId,
        media,
        offer,
        mediaStream: undefined,
      } as CallState);
      setOverlayVisible(true);
      toast({ title: "Incoming call", message: `From ${fromLabel}` });
      playIncomingCallSound();
    };

    const onIce = async (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const candidate = r.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) {
        console.log("[onIce] No peer connection, ignoring candidate");
        return;
      }
      if (!pc.remoteDescription) {
        console.log(
          "[onIce] Remote description not set yet, buffering candidate",
        );
        // Prevent unbounded ICE candidate buffering, limit to 50 candidates
        if (pendingIce.current.length < 50) {
          pendingIce.current.push(candidate);
        } else {
          console.warn(
            "[onIce] Too many pending ICE candidates, dropping oldest",
          );
          pendingIce.current.shift();
          pendingIce.current.push(candidate);
        }
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
        console.log("[onIce] Successfully added ICE candidate");
      } catch (err) {
        console.error("[onIce] Failed to add ICE candidate:", err);
      }
    };

    const onEnd = (p: unknown) => {
      const current = stateRef.current;
      if (current.kind === "idle") return;
      const r = asRecord(p);
      const callId = typeof r?.callId === "string" ? r.callId : "";
      if (callId && callId !== current.callId) return;

      const reason = typeof r?.reason === "string" ? r.reason : "";
      if (reason === "answered_elsewhere" && current.kind === "incoming") {
        stopNetworkMonitor();
        pcRef.current?.close();
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        pendingIce.current = [];
        stopCallSound();

        setState({
          kind: "answered_elsewhere",
          callId: current.callId,
          peerLabel: current.fromLabel,
          connectedAt: new Date().toISOString(),
        } as CallState);
      } else {
        cleanupRef.current?.();
      }
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
      s.off("disconnect", handleDisconnect);
      s.off("reconnect", handleReconnect);
      s.offAny(handleAnyEvent);
      s.off("call:offer", onOffer);
      s.off("call:answer", onAnswer);
      s.off("call:ice-candidate", onIce);
      s.off("call:end", onEnd);
      s.off("call:missed", onMissed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider
      value={{
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
        overlayVisible,
        setOverlayVisible,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
