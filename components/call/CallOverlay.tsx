"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  User,
} from "lucide-react";
import { useCallsStore } from "@/stores/calls";
import { useCall } from "./CallProvider";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Ringtone hook
// ─────────────────────────────────────────────
function useRingtone(active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (active) {
      // Use a reliable online ringtone (standard telephone ring)
      const audio = new Audio(
        "https://www.soundjay.com/phone/sounds/phone-calling-1.mp3",
      );
      audio.loop = true;
      audio.volume = 0.5;
      audio.play().catch(() => {
        // autoplay blocked — that's fine, user will see the UI
      });
      audioRef.current = audio;
    } else {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [active]);
}

// ─────────────────────────────────────────────
// CallOverlay
// ─────────────────────────────────────────────
export function CallOverlay() {
  const { activeCall, incomingCall } = useCallsStore();
  const {
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    isMuted,
    isVideoOff,
  } = useCall();
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Ringtone: play for callee (incoming) and optionally caller (calling)
  useRingtone(!!incomingCall);

  // ── Stream assignment ──────────────────────
  useEffect(() => {
    if (localVideoRef.current && activeCall?.localStream) {
      localVideoRef.current.srcObject = activeCall.localStream;
    }
  }, [activeCall?.localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && activeCall?.remoteStream) {
      remoteVideoRef.current.srcObject = activeCall.remoteStream;
      // Trigger play explicitly to bypass autoplay policy
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [activeCall?.remoteStream]);

  // ── Call duration timer ────────────────────
  useEffect(() => {
    if (activeCall?.status !== "connected") {
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => {
      clearInterval(id);
      setCallDuration(0);
    };
  }, [activeCall?.status]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const statusLabel = () => {
    if (!activeCall) return "";
    switch (activeCall.status) {
      case "calling":
        return "Calling…";
      case "connecting":
        return "Connecting…";
      case "connected":
        return formatDuration(callDuration);
      default:
        return "";
    }
  };

  // ─────────────────────────────────────────────
  // Incoming Call Screen
  // ─────────────────────────────────────────────
  if (incomingCall) {
    return (
      <AnimatePresence>
        <motion.div
          key="incoming"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-md"
        >
          <div className="relative bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl border border-white/10 overflow-hidden">
            {/* Animated background rings */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-3xl bg-rose-500/20"
            />
            <motion.div
              animate={{ scale: [1, 1.8, 1], opacity: [0.2, 0, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              className="absolute inset-0 rounded-3xl bg-pink-500/10"
            />

            <div className="relative text-center">
              {/* Avatar */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-24 h-24 rounded-full bg-linear-to-br from-rose-400 to-pink-500 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-rose-500/30"
              >
                <User className="w-12 h-12 text-white" />
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-1">
                {incomingCall.participant?.username || "Unknown"}
              </h2>
              <p className="text-gray-300 flex items-center justify-center gap-2 mb-8">
                {incomingCall.media === "video" ? (
                  <Video className="w-4 h-4" />
                ) : (
                  <Phone className="w-4 h-4" />
                )}
                Incoming {incomingCall.media} call…
              </p>

              {/* Accept / Decline buttons */}
              <div className="flex justify-center gap-10">
                <div className="text-center">
                  <motion.button
                    onClick={declineCall}
                    whileTap={{ scale: 0.9 }}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/40 transition-colors"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </motion.button>
                  <p className="text-xs text-gray-400 mt-2">Decline</p>
                </div>
                <div className="text-center">
                  <motion.button
                    onClick={answerCall}
                    whileTap={{ scale: 0.9 }}
                    className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-lg shadow-green-500/40 transition-colors"
                  >
                    <Phone className="w-7 h-7" />
                  </motion.button>
                  <p className="text-xs text-gray-400 mt-2">Accept</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ─────────────────────────────────────────────
  // Active Call Screen
  // ─────────────────────────────────────────────
  if (activeCall) {
    const isVideo = activeCall.media === "video";
    const isConnected = activeCall.status === "connected";
    const hasRemoteVideo = isVideo && !!activeCall.remoteStream;

    return (
      <AnimatePresence>
        <motion.div
          key="active"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-9999 bg-gray-900 flex flex-col"
        >
          {/* ── Remote video (full screen) ── */}
          {isVideo && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={cn(
                "absolute inset-0 w-full h-full object-cover",
                !hasRemoteVideo && "hidden",
              )}
            />
          )}

          {/* ── Fallback: avatar + status (audio call or no remote video yet) ── */}
          {!hasRemoteVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-br from-gray-900 via-slate-800 to-gray-900">
              <motion.div
                animate={!isConnected ? { scale: [1, 1.08, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-32 h-32 rounded-full bg-linear-to-br from-rose-400 to-pink-500 flex items-center justify-center mb-6 shadow-2xl shadow-rose-500/30"
              >
                <User className="w-16 h-16 text-white" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {activeCall.participant?.username || "Unknown"}
              </h2>
              <p className="text-gray-300 text-lg font-mono">{statusLabel()}</p>
            </div>
          )}

          {/* ── Local video PiP (video call only) ── */}
          {isVideo && activeCall.localStream && (
            <motion.div
              drag
              dragMomentum={false}
              dragConstraints={{ top: 60, bottom: -10, left: -10, right: 10 }}
              className="absolute top-24 right-4 w-28 h-36 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 cursor-move z-10"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "w-full h-full object-cover",
                  isVideoOff && "invisible",
                )}
              />
              {isVideoOff && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </motion.div>
          )}

          {/* ── Header (top bar) ── */}
          <div className="absolute top-0 left-0 right-0 p-6 bg-linear-to-b from-black/60 to-transparent z-20">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {activeCall.participant?.username || "Unknown"}
                </h2>
                <p className="text-sm text-gray-300 font-mono">
                  {statusLabel()}
                </p>
              </div>
              {isConnected && (
                <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/40 rounded-full px-3 py-1">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-300 font-medium">
                    Live
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Controls (bottom bar) ── */}
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-linear-to-t from-black/80 to-transparent z-20">
            <div className="flex items-center justify-center gap-5">
              {/* Mute */}
              <ControlButton
                onClick={toggleMute}
                active={isMuted}
                label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <MicOff className="w-6 h-6" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </ControlButton>

              {/* Video toggle (video calls only) */}
              {isVideo && (
                <ControlButton
                  onClick={toggleVideo}
                  active={isVideoOff}
                  label={isVideoOff ? "Cam On" : "Cam Off"}
                >
                  {isVideoOff ? (
                    <VideoOff className="w-6 h-6" />
                  ) : (
                    <Video className="w-6 h-6" />
                  )}
                </ControlButton>
              )}

              {/* End Call */}
              <motion.button
                onClick={endCall}
                whileTap={{ scale: 0.9 }}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/40 transition-colors"
              >
                <PhoneOff className="w-7 h-7" />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// Reusable control button
// ─────────────────────────────────────────────
function ControlButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.9 }}
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg",
          active
            ? "bg-white/30 ring-2 ring-white/50"
            : "bg-white/15 hover:bg-white/25",
        )}
      >
        {children}
      </motion.button>
      {label && <span className="text-xs text-gray-300">{label}</span>}
    </div>
  );
}
