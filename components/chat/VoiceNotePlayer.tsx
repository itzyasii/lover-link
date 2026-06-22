import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { formatElapsed } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/env";

// Track currently playing audio to prevent multiple instances
let currentlyPlaying: HTMLAudioElement | null = null;

// Global cleanup function that can be called from anywhere to stop all audio
export function stopAllVoiceNotes(): void {
  if (currentlyPlaying) {
    currentlyPlaying.pause();
    currentlyPlaying = null;
  }
}

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationMs || 0);
  const hasCalledOnListened = useRef(false);

  // Construct full absolute URL for the audio file
  const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;

  // Handle cleanup when component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        if (currentlyPlaying === audioRef.current) {
          currentlyPlaying = null;
        }
        audioRef.current.pause();
      }
    };
  }, []);

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime * 1000);
    };

    const handleLoadedMetadata = () => {
      // Ensure we only use valid, finite numbers for duration
      const audioDuration =
        !isNaN(audio.duration) && isFinite(audio.duration)
          ? audio.duration * 1000
          : 0;
      setTotalDuration(Math.max(audioDuration, durationMs || 0));
    };

    const handlePlay = () => {
      // Pause any currently playing voice note
      if (currentlyPlaying && currentlyPlaying !== audio) {
        currentlyPlaying.pause();
      }
      currentlyPlaying = audio;
      setIsPlaying(true);
      if (!listened && !hasCalledOnListened.current) {
        hasCalledOnListened.current = true;
        onListened();
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (currentlyPlaying === audio) {
        currentlyPlaying = null;
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [url, durationMs, listened, onListened]);

  const handleTogglePlay = async () => {
    if (audioRef.current) {
      try {
        if (audioRef.current.paused) {
          await audioRef.current.play();
        } else {
          audioRef.current.pause();
        }
      } catch (err) {
        console.error("Audio play error:", err);
      }
    }
  };

  const progressPercent =
    totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <div className="grid gap-2 rounded-[20px] bg-white/55 px-3 py-2 w-64 shadow-sm border border-black/5">
      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-(--wine-900)/55">
        <span>Voice message</span>
        <span className="tabular-nums">
          {formatElapsed(
            Math.max(
              0,
              isPlaying
                ? isFinite(currentTime)
                  ? currentTime
                  : 0
                : isFinite(totalDuration)
                  ? totalDuration
                  : 0,
            ),
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600 transition"
          type="button"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-0.5" />
          )}
        </button>
        <div className="grow h-10 flex flex-col justify-center overflow-hidden">
          {/* Progress bar with seek functionality */}
          <div
            className="w-full h-2 bg-rose-200 rounded-full overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (audioRef.current && totalDuration > 0) {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickPosition = (e.clientX - rect.left) / rect.width;
                audioRef.current.currentTime =
                  clickPosition * (totalDuration / 1000);
                setCurrentTime(clickPosition * totalDuration);
              }
            }}
          >
            <div
              className="h-full bg-rose-600 transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {/* Hidden native audio element for processing */}
        <audio
          ref={audioRef}
          src={fullUrl}
          crossOrigin="anonymous"
          preload="metadata"
          className="hidden"
        />
      </div>
    </div>
  );
};
