import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSocket } from "@/lib/socket";

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: number;
  messageId: string;
  isOwn: boolean;
  isListened?: boolean;
}

export function VoiceNotePlayer({
  audioUrl,
  duration = 0,
  messageId,
  isOwn,
  isListened = false,
}: VoiceNotePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(duration);
  const [isReady, setIsReady] = useState(false);
  const hasEmittedListened = useRef(isListened);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize WaveSurfer
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: isOwn ? "rgba(255, 255, 255, 0.6)" : "rgba(244, 63, 94, 0.4)", // rose-500 with opacity
      progressColor: isOwn ? "#ffffff" : "#f43f5e", // solid white or rose-500
      height: 36,
      barWidth: 3,
      barGap: 2,
      barRadius: 2,
      cursorWidth: 0,
      normalize: true,
      url: audioUrl,
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setIsReady(true);
      setTotalTime(ws.getDuration());
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    ws.on("timeupdate", (time) => {
      setCurrentTime(time);
    });

    return () => {
      ws.destroy();
    };
  }, [audioUrl, isOwn]);

  const togglePlayPause = () => {
    if (!wavesurferRef.current || !isReady) return;

    if (!isPlaying) {
      wavesurferRef.current.play();

      // Emit listened event on first play if not own message
      if (!isOwn && !hasEmittedListened.current) {
        hasEmittedListened.current = true;
        try {
          const socket = getSocket();
          if (socket) {
            socket.emit("chat:voice:listened", { messageId }, () => {});
          }
        } catch (err) {
          console.error("Failed to emit chat:voice:listened", err);
        }
      }
    } else {
      wavesurferRef.current.pause();
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Determine display time: if playing or paused mid-way, show current time.
  // If stopped at beginning/end, show total time.
  const displayTime =
    currentTime > 0 && currentTime < totalTime - 0.1
      ? formatTime(currentTime)
      : formatTime(totalTime);

  return (
    <div
      className={cn(
        "flex items-center gap-3 min-w-50 sm:min-w-60",
        isOwn ? "text-white" : "text-gray-800",
      )}
    >
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={togglePlayPause}
        disabled={!isReady}
        className={cn(
          "w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors",
          isOwn
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-rose-100 hover:bg-rose-200 text-rose-500",
          !isReady && "opacity-50 cursor-not-allowed",
        )}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </motion.button>

      <div className="flex-1 flex flex-col justify-center overflow-hidden">
        {/* Waveform container */}
        <div ref={containerRef} className="w-full relative" />

        {/* Timestamp */}
        <span
          className={cn(
            "text-[10px] mt-1 font-mono tracking-wider font-medium",
            isOwn ? "text-rose-100/90" : "text-gray-500",
          )}
        >
          {displayTime}
        </span>
      </div>
    </div>
  );
}
