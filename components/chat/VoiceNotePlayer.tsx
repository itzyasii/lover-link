import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause } from "lucide-react";
import { formatElapsed } from "@/lib/utils";

export const VoiceNotePlayer = ({
  url,
  durationMs,
  listened,
  onListened,
}: {
  url: string;
  durationMs?: number;
  listened: boolean;
  onListened: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const onListenedRef = useRef(onListened);
  const listenedRef = useRef(listened);

  useEffect(() => {
    onListenedRef.current = onListened;
    listenedRef.current = listened;
  }, [onListened, listened]);

  useEffect(() => {
    if (!containerRef.current || error) return;

    try {
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#fda4af", // rose-300
        progressColor: "#e11d48", // rose-600
        cursorColor: "#9f1239", // rose-900
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        height: 40,
        url: url,
        fetchParams: { mode: "cors" },
      });

      ws.on("play", () => {
        setIsPlaying(true);
        if (!listenedRef.current) {
          onListenedRef.current();
        }
      });
      ws.on("pause", () => setIsPlaying(false));
      ws.on("timeupdate", (time) => setCurrentTime(time * 1000));
      ws.on("finish", () => setIsPlaying(false));
      ws.on("error", (err) => {
        console.error("WaveSurfer error:", err);
        setError(true);
      });

      wavesurferRef.current = ws;

      return () => {
        ws.destroy();
      };
    } catch (err) {
      console.error("WaveSurfer init error:", err);
      setError(true);
    }
  }, [url, error]);

  const handleTogglePlay = async () => {
    if (wavesurferRef.current) {
      try {
        await wavesurferRef.current.playPause();
      } catch (err) {
        console.error("WaveSurfer play error:", err);
        setError(true);
      }
    }
  };

  if (error) {
    return (
      <div className="grid gap-2 rounded-[20px] bg-white/55 px-3 py-2 w-64 shadow-sm border border-black/5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-(--wine-900)/55">
          <span>Voice message</span>
        </div>
        <audio 
          controls 
          src={url} 
          className="w-full h-8 outline-none" 
          onPlay={() => {
            if (!listened) onListened();
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-[20px] bg-white/55 px-3 py-2 w-64 shadow-sm border border-black/5">
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--wine-900)/55">
        <span>Voice message</span>
        <span className="tabular-nums">
          {formatElapsed(isPlaying ? currentTime : (durationMs || 0))}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600 transition"
        >
          {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
        </button>
        <div ref={containerRef} className="grow overflow-hidden" />
      </div>
    </div>
  );
};
