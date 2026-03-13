"use client";

import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCall } from "./CallProvider";

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

function initials(label: string) {
  const cleaned = (label ?? "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.slice(0, 1).toUpperCase()).join("");
}

export function CallOverlay() {
  const {
    state,
    accept,
    decline,
    hangup,
    toggleMic,
    toggleCam,
    micEnabled,
    camEnabled,
    networkQuality,
  } = useCall();

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const title = useMemo(() => {
    if (state.kind === "incoming") return "Incoming call";
    if (state.kind === "outgoing") return "Calling";
    if (state.kind === "inCall") return "In call";
    return "";
  }, [state.kind]);

  const connectedAtMs = useMemo(() => {
    if (state.kind !== "inCall") return null;
    const ms = new Date(state.connectedAt).getTime();
    return Number.isFinite(ms) ? ms : null;
  }, [state]);

  useEffect(() => {
    if (state.kind === "inCall") {
      if (localRef.current) localRef.current.srcObject = state.localStream;
      if (remoteRef.current) remoteRef.current.srcObject = state.remoteStream;
      return;
    }

    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
  }, [state]);

  useEffect(() => {
    if (state.kind !== "inCall") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.kind]);

  if (state.kind === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="glass w-full max-w-4xl rounded-3xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-[family-name:var(--font-serif)] text-2xl leading-tight text-[color:var(--wine-900)]">
              {title}
            </div>
            {state.kind === "incoming" ? (
              <div className="mt-1 text-sm text-black/65">
                {state.media === "video" ? "Video" : "Audio"} call from{" "}
                <span className="font-semibold text-[color:var(--wine-900)]">
                  {state.fromLabel}
                </span>
              </div>
            ) : null}
            {state.kind === "outgoing" ? (
              <div className="mt-1 text-sm text-black/65">
                {state.media === "video" ? "Video" : "Audio"} call to{" "}
                <span className="font-semibold text-[color:var(--wine-900)]">
                  {state.toLabel}
                </span>
              </div>
            ) : null}
            {state.kind === "inCall" ? (
              <div className="mt-1 text-sm text-black/65">
                With{" "}
                <span className="font-semibold text-[color:var(--wine-900)]">
                  {state.peerLabel}
                </span>
                <span className="mx-2 text-black/30">•</span>
                <span className="tabular-nums">
                  {connectedAtMs == null
                    ? "0:00"
                    : formatElapsed(now - connectedAtMs)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {state.kind === "incoming" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-black/70">
                <Phone className="h-4 w-4" />
                Incoming
              </span>
            ) : null}
            {state.kind === "outgoing" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-black/70">
                <Phone className="h-4 w-4" />
                Ringing
              </span>
            ) : null}
            {state.kind === "inCall" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-black/70">
                {state.media === "video" ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                {state.media === "video" ? "Video" : "Audio"}
              </span>
            ) : null}
            {state.kind === "inCall" ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-black/70">
                <span
                  className={`h-2 w-2 rounded-full ${
                    networkQuality.profile === "high"
                      ? "bg-emerald-500"
                      : networkQuality.profile === "medium"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
                {networkQuality.label}
              </span>
            ) : null}
          </div>
        </div>

        {state.kind === "incoming" ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl bg-white/60 p-5">
              <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                Answer on this device
              </div>
              <div className="mt-1 text-xs text-black/55">
                Make sure your mic{state.media === "video" ? " and camera" : ""}{" "}
                are enabled.
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                  onClick={() => void accept()}
                  type="button"
                >
                  <Phone className="h-4 w-4" /> Accept
                </button>
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  onClick={() => void decline()}
                  type="button"
                >
                  <PhoneOff className="h-4 w-4" /> Decline
                </button>
              </div>
            </div>

            <div className="grid place-items-center rounded-3xl bg-[radial-gradient(closest-side,rgba(198,43,105,0.10),transparent_65%)] p-6">
              <div className="grid place-items-center">
                <div className="grid h-24 w-24 place-items-center rounded-full bg-white/70 text-2xl font-semibold text-[color:var(--wine-900)] shadow-sm">
                  {initials(state.fromLabel)}
                </div>
                <div className="mt-3 text-sm font-semibold text-[color:var(--wine-900)]">
                  {state.fromLabel}
                </div>
                <div className="mt-1 text-xs text-black/55 capitalize">
                  {state.media} call
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {state.kind === "outgoing" ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="grid place-items-center rounded-3xl bg-[radial-gradient(closest-side,rgba(198,43,105,0.10),transparent_65%)] p-6">
              <div className="grid place-items-center">
                <div className="relative grid h-24 w-24 place-items-center rounded-full bg-white/70 text-2xl font-semibold text-[color:var(--wine-900)] shadow-sm">
                  <span className="absolute inset-0 rounded-full ring-2 ring-[color:var(--rose-600)]/25 animate-pulse" />
                  <span className="relative">{initials(state.toLabel)}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-[color:var(--wine-900)]">
                  {state.toLabel}
                </div>
                <div className="mt-1 text-xs text-black/55 capitalize">
                  {state.media} call
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/60 p-5">
              <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                Trying to connect
              </div>
              <div className="mt-1 text-xs text-black/55">
                If this takes too long, they might be offline or busy.
              </div>
              <div className="mt-5">
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                  onClick={() => void hangup()}
                  type="button"
                >
                  <PhoneOff className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {state.kind === "inCall" ? (
          <div className="mt-5 grid gap-4">
            {state.media === "video" ? (
              <div className="relative overflow-hidden rounded-3xl bg-black/10">
                <video
                  ref={remoteRef}
                  autoPlay
                  playsInline
                  className="aspect-video w-full bg-black/20 object-cover"
                />
                <div className="absolute bottom-3 right-3 w-[34%] max-w-[240px] overflow-hidden rounded-2xl border border-white/30 bg-black/20 shadow-sm">
                  <video
                    ref={localRef}
                    autoPlay
                    muted
                    playsInline
                    className="aspect-video w-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="grid place-items-center rounded-3xl bg-[radial-gradient(closest-side,rgba(198,43,105,0.10),transparent_65%)] p-8">
                <div className="relative grid place-items-center">
                  <div className="absolute inset-0 -m-6 rounded-full ring-2 ring-[color:var(--rose-600)]/15 animate-pulse" />
                  <div className="relative grid h-28 w-28 place-items-center rounded-full bg-white/70 text-3xl font-semibold text-[color:var(--wine-900)] shadow-sm">
                    {initials(state.peerLabel)}
                  </div>
                </div>
                <div className="mt-4 text-sm font-semibold text-[color:var(--wine-900)]">
                  {state.peerLabel}
                </div>
                <div className="mt-1 text-xs text-black/55">
                  Audio connected
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {state.media === "video" ? (
                <div className="w-full text-center text-xs text-black/55">
                  Video adapts automatically to bandwidth.
                  {networkQuality.bitrateKbps != null
                    ? ` ${networkQuality.bitrateKbps} kbps`
                    : ""}
                  {networkQuality.rttMs != null
                    ? ` · ${networkQuality.rttMs} ms RTT`
                    : ""}
                </div>
              ) : null}
              <button
                className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
                onClick={toggleMic}
                type="button"
                title={micEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {micEnabled ? (
                  <Mic className="h-5 w-5" />
                ) : (
                  <MicOff className="h-5 w-5" />
                )}
              </button>
              {state.media === "video" ? (
                <button
                  className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
                  onClick={toggleCam}
                  type="button"
                  title={camEnabled ? "Turn camera off" : "Turn camera on"}
                >
                  {camEnabled ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <VideoOff className="h-5 w-5" />
                  )}
                </button>
              ) : null}
              <button
                className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                onClick={() => void hangup()}
                type="button"
              >
                <PhoneOff className="h-5 w-5" /> Hang up
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
