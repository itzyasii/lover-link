"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

function formatBytes(n?: number) {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMediaTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function HeartBackdrop() {
  return (
    <>
      <div className="absolute -left-10 top-8 h-28 w-28 rounded-full bg-[color:var(--rose-400)]/20 blur-3xl" />
      <div className="absolute right-0 top-1/3 h-24 w-24 rounded-full bg-[color:var(--peach-200)]/25 blur-3xl" />
      <div className="absolute bottom-2 left-1/3 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
    </>
  );
}

export function RomanticImageAttachment({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => setOpen(true)}
      >
        <div className="group relative overflow-hidden rounded-[28px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(255,230,238,0.78))] shadow-[0_20px_55px_rgba(136,33,73,0.14)]">
          <img
            src={url}
            alt={name}
            className="max-h-[520px] w-full object-contain transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[color:var(--wine-900)]/90 via-[color:var(--wine-900)]/30 to-transparent px-5 py-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.35em] text-white/65">
                  Love note
                </div>
                <div className="mt-1 text-sm font-semibold">Open the full photo</div>
              </div>
              <div className="rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                Tap to expand
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-black/55">
          <span className="truncate font-medium text-[color:var(--wine-900)]">{name}</span>
          {size ? (
            <span className="rounded-full bg-white/70 px-2.5 py-1 tabular-nums text-[color:var(--wine-900)] shadow-sm">
              {formatBytes(size)}
            </span>
          ) : null}
        </div>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,192,214,0.28),transparent_30%),linear-gradient(180deg,rgba(33,6,16,0.97),rgba(83,15,42,0.97))] p-4 backdrop-blur-md sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex min-h-full max-w-7xl items-center justify-center">
            <div
              className="relative w-full overflow-hidden rounded-[34px] border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.10),rgba(255,255,255,0.05))] shadow-[0_35px_130px_rgba(12,2,6,0.56)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <HeartBackdrop />
              <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-white sm:px-6">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.36em] text-white/55">
                    Memory viewer
                  </div>
                  <div className="truncate text-lg font-semibold">{name}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-white/12 px-3 py-2 text-xs font-semibold text-white hover:bg-white/18"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" /> Open original
                  </a>
                  <a
                    className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-white/12 px-3 py-2 text-xs font-semibold text-white hover:bg-white/18"
                    href={url}
                    download={name}
                  >
                    <Download className="h-4 w-4" /> Download
                  </a>
                  <button
                    type="button"
                    className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-[color:var(--wine-900)] hover:bg-[color:var(--peach-50)]"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" /> Close
                  </button>
                </div>
              </div>
              <div className="relative grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.03))] p-3 shadow-inner shadow-black/20">
                  <img
                    src={url}
                    alt={name}
                    className="max-h-[78vh] w-full rounded-[24px] object-contain"
                  />
                </div>
                <div className="flex flex-col justify-between gap-4 rounded-[30px] border border-white/10 bg-white/10 p-5 text-white/82">
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                        Shared in chat
                      </div>
                      <div className="mt-2 text-sm leading-6 text-white/78">
                        A richer, dedicated viewer with room for the image, the filename, and quick actions without burying everything in a plain dark modal.
                      </div>
                    </div>
                    <div className="grid gap-3 text-sm">
                      <div className="rounded-2xl bg-black/15 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.25em] text-white/45">Filename</div>
                        <div className="mt-1 break-all font-medium text-white">{name}</div>
                      </div>
                      <div className="rounded-2xl bg-black/15 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.25em] text-white/45">Size</div>
                        <div className="mt-1 font-medium text-white">{size ? formatBytes(size) : "Unknown"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 text-xs leading-5 text-white/62">
                    Press <span className="font-semibold text-white">Esc</span> or click outside the viewer to close.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function RomanticVideoAttachment({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncState = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume);
      setIsMuted(video.muted || video.volume === 0);
      setIsPlaying(!video.paused && !video.ended);
    };

    syncState();
    video.addEventListener("timeupdate", syncState);
    video.addEventListener("loadedmetadata", syncState);
    video.addEventListener("durationchange", syncState);
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    video.addEventListener("ended", syncState);

    return () => {
      video.removeEventListener("timeupdate", syncState);
      video.removeEventListener("loadedmetadata", syncState);
      video.removeEventListener("durationchange", syncState);
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("volumechange", syncState);
      video.removeEventListener("ended", syncState);
    };
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      return;
    }
    video.pause();
  };

  const seek = (nextValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = nextValue;
    setCurrentTime(nextValue);
  };

  const setVideoVolume = (nextValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextValue;
    video.muted = nextValue === 0;
    setVolume(nextValue);
    setIsMuted(nextValue === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.65;
    } else {
      video.muted = true;
    }
    setIsMuted(video.muted || video.volume === 0);
    setVolume(video.volume);
  };

  const openFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await frame.requestFullscreen?.();
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-[30px] border border-white/60 bg-[linear-gradient(155deg,rgba(255,248,250,0.98),rgba(255,229,237,0.84))] shadow-[0_22px_60px_rgba(136,33,73,0.18)]">
      <div
        ref={frameRef}
        className="relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,182,206,0.30),transparent_30%),linear-gradient(180deg,rgba(36,6,18,0.98),rgba(16,4,9,1))]"
      >
        <HeartBackdrop />
        <div className="relative px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/6 px-4 py-3 text-white backdrop-blur-sm">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.3em] text-white/55">
                Shared video
              </div>
              <div className="truncate text-sm font-semibold">{name}</div>
            </div>
            <div className="rounded-full bg-white/12 px-3 py-1 text-[11px] text-white/75">
              {size ? formatBytes(size) : "Video"}
            </div>
          </div>
        </div>
        <div className="relative px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <video
              ref={videoRef}
              src={url}
              className="max-h-[520px] w-full bg-transparent object-contain"
              preload="metadata"
              playsInline
              controls={false}
              disablePictureInPicture
              controlsList="nodownload noplaybackrate nofullscreen"
              onClick={togglePlayback}
              onContextMenu={(event) => event.preventDefault()}
            />
          </div>
          <button
            type="button"
            onClick={togglePlayback}
            className="focus-ring absolute left-1/2 top-1/2 z-10 grid h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/16 text-white shadow-[0_14px_45px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:scale-[1.03] hover:bg-white/24"
            aria-label={isPlaying ? "Pause video" : "Play video"}
          >
            {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8" />}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="rounded-[24px] bg-[color:var(--wine-900)] px-4 py-4 text-white shadow-[0_15px_40px_rgba(76,10,36,0.18)]">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.28em] text-white/58">
            <span>Playback</span>
            <span>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--rose-400),var(--peach-200))] transition-[width] duration-150"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.1}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => seek(Number(event.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-[color:var(--rose-400)]"
            aria-label="Seek video"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[color:var(--rose-700)]"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--rose-600)]/10 px-3 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-[color:var(--rose-600)]/15"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {isMuted ? "Muted" : "Volume"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(event) => setVideoVolume(Number(event.target.value))}
              className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-[color:var(--rose-600)]/15 accent-[color:var(--rose-500)]"
              aria-label="Video volume"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <a
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-[color:var(--wine-900)] shadow-sm hover:bg-[color:var(--peach-50)]"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" /> Open
            </a>
            <button
              type="button"
              onClick={() => void openFullscreen()}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--wine-900)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--wine-800)]"
            >
              <Maximize2 className="h-4 w-4" /> Cinema mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
