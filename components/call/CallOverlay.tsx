"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Video, Phone, User, PhoneOff, VideoIcon } from "lucide-react";
import { useCallsStore } from "@/stores/calls";
import { useCall } from "./CallProvider";

export function CallOverlay() {
  const { activeCall, incomingCall } = useCallsStore();
  const { answerCall, declineCall, endCall, toggleMute, toggleVideo } =
    useCall();
  const [callDuration, setCallDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const isDragging = useRef(false);
  const [position, setPosition] = useState({ x: 20, y: 100 });

  // Update video elements when streams change
  useEffect(() => {
    if (localVideoRef.current && activeCall?.localStream) {
      localVideoRef.current.srcObject = activeCall.localStream;
    }
    if (remoteVideoRef.current && activeCall?.remoteStream) {
      remoteVideoRef.current.srcObject = activeCall.remoteStream;
    }
  }, [activeCall?.localStream, activeCall?.remoteStream]);

  // Update call duration timer when call is connected
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (activeCall?.status === "connected") {
      const startTime = Date.now();
      interval = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
    // Reset duration when call disconnects - use setTimeout to avoid setting state during render
    const timeoutId = setTimeout(() => setCallDuration(0), 0);
    return () => clearTimeout(timeoutId);
  }, [activeCall?.status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Render incoming call UI
  if (incomingCall) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        >
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-linear-to-br from-rose-400 to-pink-500 flex items-center justify-center mx-auto mb-4">
                <User className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {incomingCall.participant.username}
              </h2>
              <p className="text-gray-500 mb-8 flex items-center justify-center gap-2">
                {incomingCall.media === "video" ? (
                  <Video className="w-5 h-5" />
                ) : (
                  <Phone className="w-5 h-5" />
                )}
                Incoming {incomingCall.media} call...
              </p>

              <div className="flex justify-center gap-6">
                <button
                  onClick={declineCall}
                  className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
                <button
                  onClick={answerCall}
                  className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-colors shadow-lg"
                >
                  <Phone className="w-8 h-8" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Render active call UI
  if (activeCall) {
    const isConnected = activeCall.status === "connected";

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gray-900 z-50"
        >
          {/* Remote video (full screen) */}
          {activeCall.media === "video" && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {/* Fallback for audio-only calls or if video isn't available */}
          {(!activeCall.remoteStream || activeCall.media !== "video") && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-32 h-32 rounded-full bg-linear-to-br from-rose-400 to-pink-500 flex items-center justify-center mx-auto mb-4">
                  <User className="w-16 h-16 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  {activeCall.participant.username}
                </h2>
                <p className="text-gray-300 text-lg">
                  {isConnected ? formatDuration(callDuration) : "Calling..."}
                </p>
              </div>
            </div>
          )}

          {/* Local video preview (draggable picture-in-picture) */}
          {activeCall.media === "video" && activeCall.localStream && (
            <motion.div
              drag
              dragMomentum={false}
              onDragStart={() => (isDragging.current = true)}
              onDragEnd={(_, info) => {
                isDragging.current = false;
                setPosition((prev) => ({
                  x: Math.max(
                    20,
                    Math.min(window.innerWidth - 160, prev.x + info.offset.x),
                  ),
                  y: Math.max(
                    100,
                    Math.min(window.innerHeight - 160, prev.y + info.offset.y),
                  ),
                }));
              }}
              style={{ left: position.x, top: position.y }}
              className="fixed w-36 h-48 bg-black rounded-xl overflow-hidden shadow-2xl cursor-move border-2 border-white/20"
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </motion.div>
          )}

          {/* Call controls overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-8">
            <div className="flex justify-center items-center gap-6">
              {/* Mute toggle */}
              <button
                onClick={toggleMute}
                className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <Mic className="w-6 h-6" />
              </button>

              {/* Video toggle (only for video calls) */}
              {activeCall.media === "video" && (
                <button
                  onClick={toggleVideo}
                  className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <VideoIcon className="w-6 h-6" />
                </button>
              )}

              {/* End call button */}
              <button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
              >
                <PhoneOff className="w-8 h-8" />
              </button>
            </div>
          </div>

          {/* Header with call info */}
          <div className="absolute top-0 left-0 right-0 p-6 bg-linear-to-b from-black/50 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {activeCall.participant.username}
                </h2>
                <p className="text-gray-300">
                  {isConnected ? formatDuration(callDuration) : "Connecting..."}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}
