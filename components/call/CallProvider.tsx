"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useCallsStore, ActiveCall } from "@/stores/calls";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore } from "@/stores/friends";
import { useToastStore } from "@/stores/toast";
import { getSocket } from "@/lib/socket";
import { apiFetch } from "@/lib/api";

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
interface CallContextType {
  initiateCall: (
    callee: string | { id: string; username: string },
    media: "audio" | "video",
  ) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
}

const CallContext = createContext<CallContextType | null>(null);

// ─────────────────────────────────────────────
// ICE servers – add TURN here if needed
// ─────────────────────────────────────────────
const FALLBACK_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceTransportPolicy: "all",
};

type IceServersResponse = {
  ok: boolean;
  iceServers?: RTCIceServer[];
};

async function getIceConfiguration(): Promise<RTCConfiguration> {
  try {
    const response = await apiFetch<IceServersResponse>("/api/rtc/ice-servers");
    if (
      !response.ok ||
      !Array.isArray(response.iceServers) ||
      response.iceServers.length === 0
    ) {
      throw new Error("The ICE server response was empty");
    }

    // The backend returns Cloudflare TURN entries before all fallbacks.
    return { iceServers: response.iceServers, iceTransportPolicy: "all" };
  } catch (error) {
    console.warn(
      "[Call] Unable to load Cloudflare ICE servers; using STUN fallback:",
      error,
    );
    return FALLBACK_ICE_CONFIG;
  }
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { addToast } = useToastStore();

  // Reactive auth state — needed to wire socket listeners after login
  const [authed, setAuthed] = useState(() => {
    const { accessToken, user } = useAuthStore.getState();
    return !!(accessToken && user?.id);
  });

  useEffect(() => {
    return useAuthStore.subscribe((state) => {
      setAuthed(!!(state.accessToken && state.user?.id));
    });
  }, []);

  // Clear any stale persisted activeCall on mount — a call object can never
  // survive a full page reload as the WebRTC peer connection is gone.
  useEffect(() => {
    const { activeCall } = useCallsStore.getState();
    if (activeCall) {
      useCallsStore.getState().clearActiveCall();
    }
  }, []);

  // UI-only state (needs to drive re-renders)
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // ── Refs: never stale inside socket/WebRTC callbacks ──
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  // Queue ICE candidates that arrive before remote description is set
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  // Track whether remote description has been applied
  const remoteDescSet = useRef(false);
  // Track ICE connection timeout
  const iceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /** Safely stop all tracks and close the peer connection */
  const cleanupWebRTC = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (iceTimeoutRef.current) {
      clearTimeout(iceTimeoutRef.current);
      iceTimeoutRef.current = null;
    }

    iceCandidateQueue.current = [];
    remoteDescSet.current = false;
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  /** Drain the ICE candidate queue once remote description is applied */
  const drainIceQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = iceCandidateQueue.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("[Call] Failed to add queued ICE candidate:", e);
      }
    }
  }, []);

  /** Create a new RTCPeerConnection and wire all handlers immediately */
  const createPC = useCallback(
    async (callId: string): Promise<RTCPeerConnection> => {
      // Clean up any existing connection first
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const pc = new RTCPeerConnection(await getIceConfiguration());
      pcRef.current = pc;

      // ── ICE candidate → send to peer ──
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const { activeCall } = useCallsStore.getState();
        const { user } = useAuthStore.getState();
        if (!activeCall || !user) return;

        const to =
          activeCall.callerId === user.id
            ? activeCall.calleeId
            : activeCall.callerId;

        try {
          getSocket().emit(
            "call:ice-candidate",
            {
              to,
              callId,
              candidate: event.candidate.toJSON(),
            },
            () => {},
          );
        } catch (e) {
          console.error("[Call] Failed to send ICE candidate:", e);
        }
      };

      // ── Remote track → store in remoteStream ──
      pc.ontrack = (event) => {
        console.log("[Call] ontrack fired, streams:", event.streams.length);
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        remoteStreamRef.current = stream;
        useCallsStore.getState().setRemoteStream(stream);
      };

      // ── Connection state changes ──
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log("[Call] connectionState:", state);
        if (state === "connected") {
          // Clear ICE timeout if connection succeeds
          if (iceTimeoutRef.current) {
            clearTimeout(iceTimeoutRef.current);
            iceTimeoutRef.current = null;
          }
          useCallsStore.getState().updateActiveCallStatus("connected");
        } else if (
          state === "disconnected" ||
          state === "failed" ||
          state === "closed"
        ) {
          console.log("[Call] Peer disconnected/failed, ending call");
          if (iceTimeoutRef.current) {
            clearTimeout(iceTimeoutRef.current);
            iceTimeoutRef.current = null;
          }
          useCallsStore.getState().endActiveCall();
          cleanupWebRTC();
        }
      };

      // ── ICE connection state (fallback for older browsers) ──
      pc.oniceconnectionstatechange = () => {
        console.log("[Call] iceConnectionState:", pc.iceConnectionState);
        if (
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed"
        ) {
          // Clear ICE timeout if connection succeeds
          if (iceTimeoutRef.current) {
            clearTimeout(iceTimeoutRef.current);
            iceTimeoutRef.current = null;
          }
          useCallsStore.getState().updateActiveCallStatus("connected");
        } else if (pc.iceConnectionState === "failed") {
          console.error("[Call] ICE connection failed");
          addToast("Connection failed - check network", "error");
          if (iceTimeoutRef.current) {
            clearTimeout(iceTimeoutRef.current);
            iceTimeoutRef.current = null;
          }
          useCallsStore.getState().endActiveCall();
          cleanupWebRTC();
        }
      };

      return pc;
    },
    [cleanupWebRTC, addToast],
  );

  /** Get mic+camera (or mic-only) stream */
  const getMediaStream = useCallback(
    async (media: "audio" | "video"): Promise<MediaStream> => {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          media === "video"
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              }
            : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      return stream;
    },
    [],
  );

  // ─────────────────────────────────────────────
  // Socket listeners — registered ONCE
  // All state is read via store.getState() to avoid stale closures
  // ─────────────────────────────────────────────
  useEffect(() => {
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id) return;

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    // ── call:offer ──────────────────────────────
    const onCallOffer = (
      data:
        | {
            from: string;
            to: string;
            callId: string;
            media: "audio" | "video";
            offer: RTCSessionDescriptionInit;
            fromUser?: { id: string; username: string; email?: string };
            callerName?: string;
          }
        | Array<{
            from: string;
            to: string;
            callId: string;
            media: "audio" | "video";
            offer: RTCSessionDescriptionInit;
            fromUser?: { id: string; username: string; email?: string };
            callerName?: string;
          }>,
    ) => {
      console.log("[Call] Incoming call:offer", data);

      // Handle both single object and array formats (server sends array)
      const offers = Array.isArray(data) ? data : [data];

      for (const item of offers) {
        const callerName =
          item.fromUser?.username || item.callerName || "Someone";

        const incoming: ActiveCall = {
          callId: item.callId,
          callerId: item.from,
          calleeId: item.to,
          media: item.media,
          status: "ringing",
          participant: { id: item.from, username: callerName },
          isInitiator: false,
          offeredAt: new Date().toISOString(),
          peerConnection: null,
          localStream: null,
          remoteStream: null,
          pendingOffer: item.offer,
        };

        useCallsStore.getState().setIncomingCall(incoming);
      }
    };

    // ── call:answer ──────────────────────────────
    const onCallAnswer = async (
      data:
        | {
            from: string;
            callId: string;
            answer: RTCSessionDescriptionInit;
          }
        | Array<{
            from: string;
            callId: string;
            answer: RTCSessionDescriptionInit;
          }>,
    ) => {
      console.log("[Call] Received call:answer", data);
      const pc = pcRef.current;
      if (!pc) return;

      // Handle both single object and array formats (server sends array)
      const answers = Array.isArray(data) ? data : [data];

      for (const item of answers) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(item.answer));
          remoteDescSet.current = true;
          await drainIceQueue();
          // Update caller status to "connecting" when answer is received
          useCallsStore.getState().updateActiveCallStatus("connecting");
          // Set ICE connection timeout (15 seconds)
          iceTimeoutRef.current = setTimeout(() => {
            console.error("[Call] ICE connection timeout");
            addToast("Connection timeout - check network", "error");
            useCallsStore.getState().endActiveCall();
            cleanupWebRTC();
          }, 15000);
          // Status will move to "connected" via onconnectionstatechange
        } catch (e) {
          console.error(
            "[Call] Failed to set remote description from answer:",
            e,
          );
        }
      }
    };

    // ── call:ice-candidate ───────────────────────
    const onIceCandidate = async (
      data:
        | {
            callId: string;
            candidate: RTCIceCandidateInit;
          }
        | Array<{
            callId: string;
            candidate: RTCIceCandidateInit;
          }>,
    ) => {
      const pc = pcRef.current;
      if (!pc) return;

      // Handle both single object and array formats (server sends array)
      const candidates = Array.isArray(data) ? data : [data];

      for (const item of candidates) {
        if (!item.candidate) continue;

        if (remoteDescSet.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(item.candidate));
          } catch (e) {
            console.warn("[Call] Failed to add ICE candidate:", e);
          }
        } else {
          // Queue until remote description is applied
          iceCandidateQueue.current.push(item.candidate);
        }
      }
    };

    // ── call:end ─────────────────────────────────
    const onCallEnd = (
      data:
        | { callId: string; reason?: string }
        | Array<{ callId: string; reason?: string }>,
    ) => {
      console.log("[Call] call:end received", data);
      const { activeCall, incomingCall } = useCallsStore.getState();

      // Handle both single object and array formats (server sends array)
      const events = Array.isArray(data) ? data : [data];

      for (const item of events) {
        const isOurs =
          activeCall?.callId === item.callId ||
          incomingCall?.callId === item.callId;
        if (!isOurs) continue;

        const reason = item.reason || "ended";
        if (reason === "declined") addToast("Call declined 📵", "info");
        else if (reason === "cancelled" || reason === "timeout")
          addToast("Call ended", "info");
        else if (reason === "answered_elsewhere")
          addToast("Call answered on another device", "info");
        else if (reason === "user_offline")
          addToast("Cannot call - user is offline", "warning");

        cleanupWebRTC();
        // Use clearActiveCall which clears BOTH activeCall and incomingCall
        useCallsStore.getState().clearActiveCall();
      }
    };

    // ── call:missed ──────────────────────────────
    const onCallMissed = () => {
      addToast("Missed call 📵", "warning");
      useCallsStore.getState().setIncomingCall(null);
    };

    socket.on("call:offer", onCallOffer);
    socket.on("call:answer", onCallAnswer);
    socket.on("call:ice-candidate", onIceCandidate);
    socket.on("call:end", onCallEnd);
    socket.on("call:missed", onCallMissed);

    return () => {
      socket.off("call:offer", onCallOffer);
      socket.off("call:answer", onCallAnswer);
      socket.off("call:ice-candidate", onIceCandidate);
      socket.off("call:end", onCallEnd);
      socket.off("call:missed", onCallMissed);
    };
    // Runs whenever auth changes so listeners are re-registered after login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // ─────────────────────────────────────────────
  // Public actions
  // ─────────────────────────────────────────────

  const initiateCall = useCallback(
    async (
      callee: string | { id: string; username: string },
      media: "audio" | "video",
    ) => {
      const { user } = useAuthStore.getState();
      if (!user) return;

      const calleeId = typeof callee === "string" ? callee.trim() : callee.id;
      const calleeUsername =
        typeof callee === "object" ? callee.username : "Unknown";

      // Block check
      const { blockedUsers } = useFriendsStore.getState();
      if (blockedUsers.some((b) => b.userId === calleeId)) {
        addToast("Cannot call — you have blocked this user", "error");
        return;
      }

      try {
        // 1. Create call on server → get callId
        const res = await apiFetch<{
          ok: boolean;
          callId: string;
          error?: string;
        }>("/api/calls/start", {
          method: "POST",
          body: JSON.stringify({ calleeId, media }),
        });
        if (!res.ok) throw new Error(res.error || "Failed to start call");

        const { callId } = res;

        // 2. Create peer connection (handlers wired immediately)
        const pc = await createPC(callId);

        // 3. Get media stream and add tracks
        const stream = await getMediaStream(media);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // 4. Set active call in store BEFORE sending offer so the ICE handler can read it
        const newCall: ActiveCall = {
          callId,
          callerId: user.id,
          calleeId,
          media,
          status: "calling",
          participant: { id: calleeId, username: calleeUsername },
          isInitiator: true,
          offeredAt: new Date().toISOString(),
          peerConnection: pc,
          localStream: stream,
          remoteStream: null,
        };
        useCallsStore.getState().setActiveCall(newCall);
        useCallsStore.getState().setLocalStream(stream);

        // 5. Create offer and send via socket
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        getSocket().emit(
          "call:offer",
          {
            to: calleeId,
            callId,
            media,
            offer,
            fromUser: {
              id: user.id,
              username: user.username,
              email: user.email,
            },
          },
          () => {},
        );

        addToast("Calling…", "info");
      } catch (err) {
        console.error("[Call] initiateCall failed:", err);
        addToast("Failed to start call", "error");
        cleanupWebRTC();
        useCallsStore.getState().clearActiveCall();
      }
    },
    [createPC, getMediaStream, cleanupWebRTC, addToast],
  );

  const answerCall = useCallback(async () => {
    const { incomingCall } = useCallsStore.getState();
    const { user } = useAuthStore.getState();
    if (!incomingCall || !user) return;

    const offer = incomingCall.pendingOffer;
    if (!offer) {
      addToast("No offer found — call may have expired", "error");
      return;
    }

    try {
      // 1. Create PC (handlers wired immediately)
      const pc = await createPC(incomingCall.callId);

      // 2. Get media
      const stream = await getMediaStream(incomingCall.media);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 3. Move call to active state BEFORE touching SDP so ICE can be routed
      const activeCallData: ActiveCall = {
        ...incomingCall,
        status: "connecting",
        answeredAt: new Date().toISOString(),
        peerConnection: pc,
        localStream: stream,
        remoteStream: null,
      };
      useCallsStore.getState().setActiveCall(activeCallData);
      useCallsStore.getState().setIncomingCall(null);
      useCallsStore.getState().setLocalStream(stream);

      // 4. Set remote description, drain queue, create answer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      remoteDescSet.current = true;
      await drainIceQueue();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Set ICE connection timeout (15 seconds)
      iceTimeoutRef.current = setTimeout(() => {
        console.error("[Call] ICE connection timeout");
        addToast("Connection timeout - check network", "error");
        useCallsStore.getState().endActiveCall();
        cleanupWebRTC();
      }, 15000);

      // 5. Send answer
      getSocket().emit(
        "call:answer",
        {
          to: incomingCall.callerId,
          callId: incomingCall.callId,
          answer,
        },
        () => {},
      );
    } catch (err) {
      console.error("[Call] answerCall failed:", err);
      addToast("Failed to answer call", "error");
      cleanupWebRTC();
      useCallsStore.getState().clearActiveCall();
    }
  }, [createPC, getMediaStream, drainIceQueue, cleanupWebRTC, addToast]);

  const declineCall = useCallback(() => {
    const { incomingCall } = useCallsStore.getState();
    if (!incomingCall) return;
    try {
      getSocket().emit(
        "call:end",
        {
          to: incomingCall.callerId,
          callId: incomingCall.callId,
          reason: "declined",
        },
        () => {},
      );
    } catch {}
    useCallsStore.getState().setIncomingCall(null);
  }, []);

  const endCall = useCallback(() => {
    const { activeCall } = useCallsStore.getState();
    const { user } = useAuthStore.getState();
    if (!activeCall || !user) return;

    const to =
      activeCall.callerId === user.id
        ? activeCall.calleeId
        : activeCall.callerId;

    try {
      getSocket().emit(
        "call:end",
        {
          to,
          callId: activeCall.callId,
          reason: "user_initiated",
        },
        () => {},
      );
    } catch {}

    cleanupWebRTC();
    useCallsStore.getState().endActiveCall();
  }, [cleanupWebRTC]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoOff((prev) => !prev);
  }, []);

  // Cleanup on provider unmount
  useEffect(() => {
    return () => {
      cleanupWebRTC();
    };
  }, [cleanupWebRTC]);

  return (
    <CallContext.Provider
      value={{
        initiateCall,
        answerCall,
        declineCall,
        endCall,
        toggleMute,
        toggleVideo,
        isMuted,
        isVideoOff,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}
