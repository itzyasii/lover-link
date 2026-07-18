"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useCallsStore, ActiveCall } from "@/stores/calls";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore } from "@/stores/friends";
import { useToastStore } from "@/stores/toast";
import { getSocket } from "@/lib/socket";
import { apiFetch } from "@/lib/api";

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
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const {
    activeCall,
    incomingCall,
    setActiveCall,
    setIncomingCall,
    setPeerConnection,
    setLocalStream,
    setRemoteStream,
    endActiveCall,
    clearActiveCall,
  } = useCallsStore();
  const { user } = useAuthStore();
  const { blockedUsers } = useFriendsStore();
  const { addToast } = useToastStore();

  // Check if either user has blocked the other (required by CALLS-MESSAGES-NOTIFICATIONS-GUIDE)
  const isBlockedEitherWay = (userId1: string, userId2: string): boolean => {
    // Check if current user has blocked the other user
    const isBlockedByCurrentUser = blockedUsers.some(
      (b) => b.userId === userId2,
    );
    // Note: Server-side also checks if the other user has blocked current user
    // This is a client-side pre-check to prevent unnecessary API calls
    return isBlockedByCurrentUser;
  };

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const isMutedRef = useRef(false);
  const isVideoOffRef = useRef(false);

  // Store pending offer to share between socket listener and answerCall
  const pendingOfferRef = useRef<{
    callId: string;
    offer: RTCSessionDescriptionInit;
    from: string;
  } | null>(null);

  // Queue pending ICE candidates to add after remote description is set
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );

  const ICE_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Helper to add all queued ICE candidates after remote description is set
  const addQueuedIceCandidates = async (
    callId: string,
    pc: RTCPeerConnection,
  ) => {
    const queuedCandidates = pendingIceCandidatesRef.current.get(callId) || [];
    console.log(
      `[CallProvider] Adding ${queuedCandidates.length} queued ICE candidates for call ${callId}`,
    );

    for (const candidate of queuedCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(
          "[CallProvider] Error adding queued ICE candidate:",
          error,
        );
      }
    }

    // Clear the queue after processing
    pendingIceCandidatesRef.current.delete(callId);
  };

  // Initialize socket event listeners for WebRTC signaling
  useEffect(() => {
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id) return;

    try {
      const socket = getSocket();

      // Handle incoming call offer from server
      socket.on(
        "call:offer",
        async (data: {
          from: string;
          to: string;
          callId: string;
          media: "audio" | "video";
          offer: RTCSessionDescriptionInit;
          fromUser?: {
            id: string;
            email: string;
            username: string;
          };
          callerName?: string;
        }) => {
          console.log("[CallProvider] Incoming call offer:", data);

          // Store the offer to use when answering
          pendingOfferRef.current = {
            callId: data.callId,
            offer: data.offer,
            from: data.from,
          };

          // Extract caller name from fromUser object if available (new backend format)
          const callerName =
            data.fromUser?.username || data.callerName || "Unknown User";
          const incomingCallData: ActiveCall = {
            callId: data.callId,
            callerId: data.from,
            calleeId: data.to,
            media: data.media,
            status: "ringing",
            participant: {
              id: data.from,
              username: callerName,
            },
            isInitiator: false,
            offeredAt: new Date().toISOString(),
            peerConnection: null,
            localStream: null,
            remoteStream: null,
          };

          console.log(
            "[CallProvider] Created incoming call data:",
            incomingCallData,
          );
          setIncomingCall(incomingCallData);
          addToast(`Incoming ${data.media} call from ${callerName}!`, "info");
        },
      );

      // Handle call answer from caller
      socket.on(
        "call:answer",
        async (data: {
          from: string;
          to: string;
          callId: string;
          answer: RTCSessionDescriptionInit;
        }) => {
          console.log("[CallProvider] Call answered:", data);

          if (peerConnectionRef.current && activeCall?.callId === data.callId) {
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(data.answer),
            );
            // Add all queued ICE candidates after setting remote description
            await addQueuedIceCandidates(
              data.callId,
              peerConnectionRef.current,
            );
            useCallsStore.getState().updateActiveCallStatus("connected");
          }
        },
      );

      // Handle incoming ICE candidates
      socket.on(
        "call:ice-candidate",
        async (data: {
          to: string;
          callId: string;
          candidate: RTCIceCandidateInit;
        }) => {
          console.log("[CallProvider] Received ICE candidate:", data);

          if (peerConnectionRef.current && activeCall?.callId === data.callId) {
            // If remote description is already set, add the candidate immediately
            if (peerConnectionRef.current.remoteDescription) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(data.candidate),
                );
              } catch (error) {
                console.error(
                  "[CallProvider] Error adding ICE candidate:",
                  error,
                );
              }
            } else {
              // Queue the candidate to add after remote description is set
              const candidates =
                pendingIceCandidatesRef.current.get(data.callId) || [];
              candidates.push(data.candidate);
              pendingIceCandidatesRef.current.set(data.callId, candidates);
              console.log(
                `[CallProvider] Queued ICE candidate for call ${data.callId}`,
              );
            }
          }
        },
      );

      // Handle call end from server
      socket.on(
        "call:end",
        (data: { ok: boolean; callId: string; reason: string }) => {
          console.log("[CallProvider] Call ended:", data);

          if (
            activeCall?.callId === data.callId ||
            incomingCall?.callId === data.callId ||
            pendingOfferRef.current?.callId === data.callId
          ) {
            // Clear pending offer if this was the call that ended
            if (pendingOfferRef.current?.callId === data.callId) {
              pendingOfferRef.current = null;
            }
            // Clear any queued ICE candidates for this call
            pendingIceCandidatesRef.current.delete(data.callId);
            if (data.reason === "declined") {
              addToast("Call was declined", "info");
            } else if (data.reason === "cancelled") {
              addToast("Call was cancelled", "info");
            }
            clearActiveCall();
          }
        },
      );

      // Handle missed call notification
      socket.on(
        "call:missed",
        (data: { callId: string; from: string; at: string }) => {
          console.log("[CallProvider] Missed call:", data);
          addToast("You missed a call!", "warning");
          setIncomingCall(null);
        },
      );

      return () => {
        socket.off("call:offer");
        socket.off("call:answer");
        socket.off("call:ice-candidate");
        socket.off("call:end");
        socket.off("call:missed");
      };
    } catch (error) {
      console.error("[CallProvider] Failed to initialize socket:", error);
    }
  }, [activeCall, incomingCall, addToast, setIncomingCall, clearActiveCall]);

  // Initialize peer connection event handlers
  useEffect(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && activeCall) {
          const { accessToken, user } = useAuthStore.getState();
          if (!accessToken || !user?.id) return;

          try {
            const socket = getSocket();
            socket.emit(
              "call:ice-candidate",
              {
                to:
                  activeCall.callerId === user.id
                    ? activeCall.calleeId
                    : activeCall.callerId,
                callId: activeCall.callId,
                candidate: event.candidate,
              },
              () => {},
            );
          } catch (error) {
            console.error(
              "[CallProvider] Failed to send ICE candidate:",
              error,
            );
          }
        }
      };

      peerConnectionRef.current.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setRemoteStream(remoteStream);
      };

      peerConnectionRef.current.onconnectionstatechange = () => {
        if (peerConnectionRef.current?.connectionState === "disconnected") {
          endActiveCall();
        }
      };
    }
  }, [activeCall, user?.id, setRemoteStream, endActiveCall]);

  const createPeerConnection = async (): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnectionRef.current = pc;
    setPeerConnection(pc);
    return pc;
  };

  const getMediaStream = async (
    media: "audio" | "video",
  ): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: media === "video" ? { width: 1280, height: 720 } : false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const initiateCall = async (
    callee: string | { id: string; username: string },
    media: "audio" | "video",
  ) => {
    if (!user) return;

    // Extract calleeId and username
    const calleeId = typeof callee === "string" ? callee : callee.id;
    const calleeUsername =
      typeof callee === "object" && callee.username
        ? callee.username
        : "Unknown User";
    console.log(
      "[CallProvider] Extracted calleeUsername:",
      calleeUsername,
      "from callee:",
      callee,
    );

    // Block check as required by CALLS-MESSAGES-NOTIFICATIONS-GUIDE
    if (isBlockedEitherWay(user.id, calleeId)) {
      addToast("Cannot call this user - you have blocked them", "error");
      return;
    }

    try {
      // First create call via REST API to get callId (matches backend /api/calls/start endpoint)
      const res = await apiFetch<{
        ok: boolean;
        callId: string;
        error?: string;
      }>("/api/calls/start", {
        method: "POST",
        body: JSON.stringify({ calleeId, media }),
      });

      if (!res.ok) {
        throw new Error(res.error || "Failed to initiate call");
      }
      const { callId } = res;

      // Create peer connection and get media stream
      const pc = await createPeerConnection();
      const stream = await getMediaStream(media);

      // Add all tracks to peer connection
      stream.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });

      // Create and send WebRTC offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer via socket with caller info for the callee
      const socket = getSocket();
      if (pc.localDescription) {
        socket.emit(
          "call:offer",
          {
            to: calleeId,
            callId,
            media,
            offer: pc.localDescription,
            // Send caller's user info so the callee sees the correct username
            fromUser: {
              id: user.id,
              email: user.email,
              username: user.username,
            },
          },
          () => {},
        );
      }

      // Get the callee's username from friends list
      // If we only have an ID, still try to find the user in friends list as fallback
      const friends = useFriendsStore.getState().friends;
      console.log("[CallProvider] Current friends list:", friends);
      console.log("[CallProvider] Looking for calleeId:", calleeId);
      const foundFriend = friends.find((f) => f.id === calleeId);
      console.log("[CallProvider] Found friend:", foundFriend);

      const finalCalleeUsername =
        calleeUsername !== "Unknown User"
          ? calleeUsername
          : foundFriend?.username || "Unknown User";
      console.log(
        "[CallProvider] Using callee username:",
        finalCalleeUsername,
        "calleeId:",
        calleeId,
      );

      // Set active call state
      const newCall: ActiveCall = {
        callId,
        callerId: user.id,
        calleeId,
        media,
        status: "calling",
        participant: { id: calleeId, username: finalCalleeUsername },
        isInitiator: true,
        offeredAt: new Date().toISOString(),
        peerConnection: pc,
        localStream: stream,
        remoteStream: null,
      };
      console.log("[CallProvider] Created outgoing active call:", newCall);

      setActiveCall(newCall);
      addToast(`Calling...`, "info");
    } catch (error) {
      console.error("[CallProvider] Failed to initiate call:", error);
      addToast("Failed to start call", "error");
    }
  };

  const answerCall = async () => {
    if (!incomingCall || !user) return;

    // Block check as required by CALLS-MESSAGES-NOTIFICATIONS-GUIDE
    if (isBlockedEitherWay(user.id, incomingCall.callerId)) {
      addToast("Cannot answer call - you have blocked this user", "error");
      declineCall();
      return;
    }

    try {
      const socket = getSocket();
      const pc = await createPeerConnection();
      const stream = await getMediaStream(incomingCall.media);

      // Add tracks to peer connection
      stream.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });

      // Set the remote description from the pending offer
      if (
        pendingOfferRef.current &&
        pendingOfferRef.current.callId === incomingCall.callId
      ) {
        await pc.setRemoteDescription(
          new RTCSessionDescription(pendingOfferRef.current.offer),
        );
        // Add all queued ICE candidates after setting remote description
        await addQueuedIceCandidates(incomingCall.callId, pc);
      } else {
        throw new Error("No pending offer found for this call");
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer via socket
      if (pc.localDescription) {
        socket.emit(
          "call:answer",
          {
            to: incomingCall.callerId,
            callId: incomingCall.callId,
            answer: pc.localDescription,
          },
          () => {},
        );
      }

      // Move incoming call to active call
      const activeCallData: ActiveCall = {
        ...incomingCall,
        status: "connected",
        answeredAt: new Date().toISOString(),
        peerConnection: pc,
        localStream: stream,
      };

      setActiveCall(activeCallData);
      setIncomingCall(null);
      addToast("Call connected!", "success");
    } catch (error) {
      console.error("[CallProvider] Failed to answer call:", error);
      addToast("Failed to answer call", "error");
    }
  };

  const declineCall = () => {
    if (!incomingCall) return;

    const socket = getSocket();
    socket.emit(
      "call:end",
      {
        to: incomingCall.callerId,
        callId: incomingCall.callId,
        reason: "declined",
      },
      () => {},
    );

    setIncomingCall(null);
  };

  const endCall = () => {
    if (!activeCall) return;

    // Clear any queued ICE candidates for this call
    pendingIceCandidatesRef.current.delete(activeCall.callId);

    const socket = getSocket();
    socket.emit(
      "call:end",
      {
        to:
          activeCall.callerId === user?.id
            ? activeCall.calleeId
            : activeCall.callerId,
        callId: activeCall.callId,
        reason: "user_initiated",
      },
      () => {},
    );

    endActiveCall();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    isMutedRef.current = !isMutedRef.current;
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;

    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !track.enabled;
    });
    isVideoOffRef.current = !isVideoOffRef.current;
  };

  return (
    <CallContext.Provider
      value={{
        initiateCall,
        answerCall,
        declineCall,
        endCall,
        toggleMute,
        toggleVideo,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
