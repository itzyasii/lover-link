import React, { useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Trash2, Send } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const {
    state,
    duration,
    waveformData,
    audioBlob,
    start,
    pause,
    resume,
    stop,
    cancel
  } = useVoiceRecorder();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Start recording as soon as the component mounts
  useEffect(() => {
    start();
    return () => {
      cancel();
    };
  }, [start, cancel]);

  // Handle blob generation for sending
  const handleSend = useCallback(() => {
    if (state === "recording" || state === "paused") {
      // If we're still recording, stop first
      stop();
    } else if (state === "stopped" && audioBlob && duration > 0) {
      // Already stopped, send directly
      onSend(audioBlob, duration);
    }
  }, [state, stop, audioBlob, duration, onSend]);

  // Watch for audioBlob to be set (which happens after stop())
  useEffect(() => {
    if (audioBlob && duration > 0 && state === "stopped") {
      onSend(audioBlob, duration);
    }
  }, [audioBlob, duration, state, onSend]);

  const handleCancel = useCallback(() => {
    cancel();
    onCancel();
  }, [cancel, onCancel]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (waveformData.length === 0) return;

      const barWidth = 3;
      const gap = 2;
      const maxBars = Math.floor(canvas.width / (barWidth + gap));
      const step = Math.floor(waveformData.length / maxBars);
      
      const centerY = canvas.height / 2;

      for (let i = 0; i < maxBars; i++) {
        const dataIndex = i * step;
        if (dataIndex >= waveformData.length) break;

        // data is between -1 and 1
        const value = waveformData[dataIndex] || 0;
        // Amplify the value for better visualization
        const amplitude = Math.abs(value) * 3;
        
        // Base height so there's always a tiny bar
        const minHeight = 4;
        const height = Math.max(minHeight, amplitude * canvas.height);

        const x = i * (barWidth + gap);
        const y = centerY - height / 2;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#f43f5e'); // rose-500
        gradient.addColorStop(1, '#ec4899'); // pink-500

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, height, barWidth / 2);
        ctx.fill();
      }
    };

    let animationId: number;
    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [waveformData]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex items-center gap-2 flex-1 h-full bg-linear-to-r from-rose-50 to-pink-50 rounded-full px-3 py-1.5 border border-rose-200 overflow-hidden"
    >
      <button 
        onClick={handleCancel}
        className="p-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {state === "recording" ? (
        <button 
          onClick={pause}
          className="p-2 rounded-full text-rose-500 hover:bg-rose-100 transition-colors"
        >
          <Pause className="w-5 h-5 fill-current" />
        </button>
      ) : (
        <button 
          onClick={resume}
          className="p-2 rounded-full text-rose-500 hover:bg-rose-100 transition-colors"
        >
          <Play className="w-5 h-5 fill-current" />
        </button>
      )}

      <div className="flex flex-col justify-center px-2 min-w-[50px]">
        <div className="flex items-center gap-1.5">
          <motion.div 
            animate={{ opacity: state === "recording" ? [1, 0.3, 1] : 1 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className={cn(
              "w-2 h-2 rounded-full",
              state === "recording" ? "bg-red-500" : "bg-gray-400"
            )}
          />
          <span className="text-sm font-medium text-gray-700 font-mono">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex-1 h-10 relative">
        <canvas 
          ref={canvasRef}
          width={200} // Logical width, will scale to container
          height={40}
          className="w-full h-full object-contain pointer-events-none"
        />
        {/* Glow effect for canvas */}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-pink-500/10 blur-md rounded-full -z-10 mix-blend-multiply opacity-50 pointer-events-none" />
      </div>

      <motion.button
        type="button"
        onClick={handleSend}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        disabled={duration < 0.5 || state === "stopped"}
        className="p-2.5 rounded-full bg-linear-to-r from-rose-500 to-pink-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed ml-1"
      >
        <Send className="w-4 h-4 ml-0.5" />
      </motion.button>
    </motion.div>
  );
}
