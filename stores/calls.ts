"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CallStatus =
  | "idle"
  | "ringing" // Incoming call, waiting to be answered
  | "calling" // Outgoing call, ringing for recipient
  | "connecting" // Call answered, ICE negotiating
  | "connected" // Call is active
  | "ending"; // Call is in process of ending

export type CallMedia = "audio" | "video";

export interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  participant: {
    id: string;
    username: string;
    avatar?: string;
  };
  isInitiator: boolean;
  offeredAt: string;
  answeredAt?: string;
  endedAt?: string;
  peerConnection: RTCPeerConnection | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  pendingOffer?: RTCSessionDescriptionInit; // stored on callee side until answered
}

export interface CallHistoryItem {
  id: string;
  callId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: "ended" | "cancelled" | "declined" | "missed";
  offeredAt: string;
  answeredAt?: string;
  endedAt?: string;
  duration?: number;
  participant: {
    id: string;
    username: string;
    avatar?: string;
  };
}

interface CallsState {
  activeCall: ActiveCall | null;
  callHistory: CallHistoryItem[];
  incomingCall: ActiveCall | null;
}

interface CallsActions {
  setActiveCall: (call: ActiveCall | null) => void;
  setIncomingCall: (call: ActiveCall | null) => void;
  updateActiveCallStatus: (status: CallStatus) => void;
  setPeerConnection: (pc: RTCPeerConnection | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  addCallToHistory: (call: CallHistoryItem) => void;
  setCallHistory: (calls: CallHistoryItem[]) => void;
  clearActiveCall: () => void;
  endActiveCall: () => void;
}

const initialState: CallsState = {
  activeCall: null,
  callHistory: [],
  incomingCall: null,
};

export const useCallsStore = create<CallsState & CallsActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveCall: (call: ActiveCall | null) => {
        set({ activeCall: call });
      },

      setIncomingCall: (call: ActiveCall | null) => {
        set({ incomingCall: call });
      },

      updateActiveCallStatus: (status: CallStatus) => {
        set((state) => {
          if (!state.activeCall) return state;
          return {
            activeCall: {
              ...state.activeCall,
              status,
              // Only set answeredAt if it's not already set and we're connecting/connected
              ...(status === "connected" && !state.activeCall.answeredAt
                ? { answeredAt: new Date().toISOString() }
                : {}),
            },
          };
        });
      },

      setPeerConnection: (pc: RTCPeerConnection | null) => {
        set((state) => {
          if (!state.activeCall) return state;
          return {
            activeCall: {
              ...state.activeCall,
              peerConnection: pc,
            },
          };
        });
      },

      setLocalStream: (stream: MediaStream | null) => {
        set((state) => {
          if (!state.activeCall) return state;
          return {
            activeCall: {
              ...state.activeCall,
              localStream: stream,
            },
          };
        });
      },

      setRemoteStream: (stream: MediaStream | null) => {
        set((state) => {
          if (!state.activeCall) return state;
          return {
            activeCall: {
              ...state.activeCall,
              remoteStream: stream,
            },
          };
        });
      },

      addCallToHistory: (call: CallHistoryItem) => {
        set((state) => ({
          callHistory: [call, ...state.callHistory],
        }));
      },

      setCallHistory: (calls: CallHistoryItem[]) => {
        set({ callHistory: calls });
      },

      clearActiveCall: () => {
        const state = get();
        // Clean up media streams and peer connection
        if (state.activeCall) {
          state.activeCall.localStream
            ?.getTracks()
            .forEach((track) => track.stop());
          state.activeCall.remoteStream
            ?.getTracks()
            .forEach((track) => track.stop());
          state.activeCall.peerConnection?.close();
        }
        set({ activeCall: null, incomingCall: null });
      },

      endActiveCall: () => {
        const state = get();
        if (state.activeCall) {
          // Add to history before clearing
          const historyItem: CallHistoryItem = {
            id: state.activeCall.callId,
            callId: state.activeCall.callId,
            callerId: state.activeCall.callerId,
            calleeId: state.activeCall.calleeId,
            media: state.activeCall.media,
            status: "ended",
            offeredAt: state.activeCall.offeredAt,
            answeredAt: state.activeCall.answeredAt,
            endedAt: new Date().toISOString(),
            duration: state.activeCall.answeredAt
              ? Math.floor(
                  (Date.now() -
                    new Date(state.activeCall.answeredAt).getTime()) /
                    1000,
                )
              : undefined,
            participant: state.activeCall.participant,
          };

          // Clean up resources
          state.activeCall.localStream
            ?.getTracks()
            .forEach((track) => track.stop());
          state.activeCall.remoteStream
            ?.getTracks()
            .forEach((track) => track.stop());
          state.activeCall.peerConnection?.close();

          set({
            activeCall: null,
            incomingCall: null,
            callHistory: [historyItem, ...state.callHistory],
          });
        }
      },
    }),
    {
      name: "calls-storage",
      partialize: (state) => ({ callHistory: state.callHistory }),
    },
  ),
);
