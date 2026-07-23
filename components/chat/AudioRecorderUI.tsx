import React, { useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Pause, Play, Trash2, Send } from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { cn } from "@/lib/utils";

interface AudioRecorderUIProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export function AudioRecorderUI({ onSend, onCancel }: AudioRecorderUIProps) {
  const { state, duration, audioBlob, start, pause, resume, stop, cancel } =
    useAudioRecorder();

  const hasStarted = useRef(false);

  // Start recording only once when component mounts
  useEffect(() => {
    if (!hasStarted.current) {
      start();
      hasStarted.current = true;
    }
    return () => {
      cancel();
    };
  }, [start, cancel]);

  const handleSend = useCallback(async () => {
    if (state === "recording" || state === "paused") {
      const blob = await stop();
      if (blob && duration > 0) {
        onSend(blob, duration);
      }
    } else if (state === "stopped" && audioBlob && duration > 0) {
      onSend(audioBlob, duration);
    }
  }, [state, stop, audioBlob, duration, onSend]);

  const handleCancel = useCallback(() => {
    cancel();
    onCancel();
  }, [cancel, onCancel]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center justify-between gap-2 flex-1 h-full bg-linear-to-r from-rose-50 to-pink-50 rounded-full px-4 py-1.5 border border-rose-200 overflow-hidden shadow-xs"
    >
      <button
        onClick={handleCancel}
        className="p-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-3 flex-1 justify-center">
        {state === "preparing" ? (
          <div className="text-sm text-gray-500 italic px-2">Starting...</div>
        ) : (
          <>
            {state === "recording" ? (
              <button
                onClick={pause}
                className="p-2 rounded-full text-rose-500 hover:bg-rose-100 transition-colors shrink-0"
              >
                <Pause className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button
                onClick={resume}
                className="p-2 rounded-full text-rose-500 hover:bg-rose-100 transition-colors shrink-0"
              >
                <Play className="w-5 h-5 fill-current" />
              </button>
            )}

            <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-full border border-rose-100">
              <motion.div
                animate={{
                  scale: state === "recording" ? [1, 1.2, 1] : 1,
                  opacity: state === "recording" ? [1, 0.5, 1] : 0.5,
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className={cn(
                  "w-2.5 h-2.5 rounded-full flex shrink-0",
                  state === "recording" ? "bg-red-500" : "bg-gray-400",
                )}
              />
              <span className="text-sm font-medium text-gray-700 font-mono w-12 text-center">
                {formatTime(duration)}
              </span>
            </div>
          </>
        )}
      </div>

      <motion.button
        type="button"
        onClick={handleSend}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        disabled={duration < 1 || state === "stopped" || state === "preparing"}
        className="p-2.5 rounded-full bg-linear-to-r from-rose-500 to-pink-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <Send className="w-4 h-4 ml-0.5" />
      </motion.button>
    </motion.div>
  );
}
