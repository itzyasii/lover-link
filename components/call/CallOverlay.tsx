"use client";

import {
  Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX,
  Video, VideoOff, RotateCcw, Maximize2, Minimize2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { initials, formatElapsed } from "@/lib/utils";
import Draggable from "react-draggable";
import { useCall } from "@/components/call/CallProvider";

// ─── sub-components ──────────────────────────────────────────────────────────

function Avatar({ label, size = "lg" }: { label: string; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "h-32 w-32 text-4xl" : "h-20 w-20 text-2xl";
  return (
    <div className={`relative ${sz} shrink-0`}>
      {/* Pulsing glow rings (incoming / outgoing only) */}
      <div className="absolute inset-0 rounded-full bg-rose-400/20 animate-ping [animation-duration:2s]" />
      <div className="absolute inset-2 rounded-full bg-rose-400/15 animate-ping [animation-duration:2.5s] [animation-delay:0.5s]" />
      <div className={`relative grid place-items-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 font-bold text-rose-600 shadow-xl border-4 border-white/30 ${sz}`}>
        {initials(label)}
      </div>
    </div>
  );
}

function ControlButton({
  onClick, active, danger, disabled = false,
  children, size = "md", title,
}: {
  onClick: () => void; active?: boolean; danger?: boolean;
  disabled?: boolean; children: React.ReactNode; size?: "sm" | "md" | "lg"; title?: string;
}) {
  const sizeClass = size === "sm" ? "h-11 w-11" : size === "lg" ? "h-18 w-18" : "h-14 w-14";
  const iconSize = size === "sm" ? "h-5 w-5" : size === "lg" ? "h-8 w-8" : "h-6 w-6";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`
        focus-ring inline-flex items-center justify-center rounded-full
        backdrop-blur-md border border-white/10
        transition-all duration-200 active:scale-90
        ${sizeClass}
        ${danger
          ? "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/40"
          : active === false
            ? "bg-white/10 text-white/40"
            : "bg-white/15 hover:bg-white/25 text-white"
        }
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      <span className={iconSize}>{children}</span>
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function CallOverlay() {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const {
    state, accept, decline, hangup,
    toggleMic, toggleCam, toggleSpeaker,
    micEnabled, camEnabled, speakerEnabled,
    switchOutputDevice,
  } = useCall();

  const [usingFrontCamera, setUsingFrontCamera] = useState(() => {
    try { return JSON.parse(localStorage.getItem("usingFrontCamera") ?? "true") as boolean; }
    catch { return true; }
  });
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentOutputDevice, setCurrentOutputDevice] = useState<string>("");
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tick, setTick] = useState(Date.now);
  const nodeRef = useRef<HTMLDivElement>(null);

  const elapsedMs = state.kind === "inCall" ? tick - new Date(state.connectedAt).getTime() : 0;

  // Enumerate output devices
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setOutputDevices(outputs);
      if (outputs[0]) setCurrentOutputDevice(outputs[0].deviceId);
    });
  }, []);

  // Stream bindings
  useEffect(() => {
    if (state.kind !== "inCall") return;
    if (localRef.current && state.localStream) localRef.current.srcObject = state.localStream;
    if (remoteRef.current && state.remoteStream) remoteRef.current.srcObject = state.remoteStream;
    if (remoteAudioRef.current && state.remoteStream && state.media !== "video") {
      remoteAudioRef.current.srcObject = state.remoteStream;
    }
  }, [state]);

  // Auto-expand on incoming/outgoing
  useEffect(() => {
    if (state.kind === "incoming" || state.kind === "outgoing") setMinimized(false);
  }, [state.kind]);

  // 1-second clock tick
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const flipCamera = useCallback(async () => {
    if (!("mediaStream" in state) || !state.mediaStream) return;
    const track = state.mediaStream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ facingMode: usingFrontCamera ? "environment" : "user" });
      const next = !usingFrontCamera;
      setUsingFrontCamera(next);
      localStorage.setItem("usingFrontCamera", String(next));
    } catch (err) {
      console.error("Camera flip failed:", err);
    }
  }, [state, usingFrontCamera]);

  if (state.kind === "idle") return null;

  // ─── PIP (minimized) shell ────────────────────────────────────────────────
  if (minimized) {
    return (
      <Draggable bounds="body" nodeRef={nodeRef}>
        <div
          ref={nodeRef}
          className="fixed bottom-24 right-4 z-[200] w-[180px] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/20 cursor-grab active:cursor-grabbing select-none"
          style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}
        >
          {/* Video / Avatar area */}
          <div className="relative h-[240px] bg-gray-900 overflow-hidden">
            {state.kind === "inCall" && state.media === "video" ? (
              <>
                <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                {state.mediaStream && (
                  <div className={`absolute bottom-2 right-2 w-[44px] rounded-xl overflow-hidden border border-white/20 aspect-[9/16] ${usingFrontCamera ? "scale-x-[-1]" : ""}`}>
                    <video
                      autoPlay playsInline muted
                      ref={(el) => { if (el && state.mediaStream && el.srcObject !== state.mediaStream) el.srcObject = state.mediaStream; }}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-900 to-gray-800">
                {state.kind === "inCall" && <audio ref={remoteAudioRef} autoPlay playsInline />}
                <div className="h-16 w-16 grid place-items-center rounded-full bg-gradient-to-br from-rose-200 to-pink-300 text-2xl font-bold text-rose-600 shadow-lg">
                  {initials(state.kind === "inCall" ? state.peerLabel : state.kind === "incoming" ? state.fromLabel : state.kind === "outgoing" ? state.toLabel : "?")}
                </div>
                {state.kind === "inCall" && (
                  <p className="font-mono text-xs font-semibold text-white/70">{formatElapsed(elapsedMs)}</p>
                )}
              </div>
            )}
            {/* Expand button */}
            <button
              className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mini controls */}
          <div className="flex items-center justify-around py-2.5 px-2 bg-gray-900/90">
            {state.kind === "incoming" ? (
              <>
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={() => void decline()} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white active:scale-90 transition-transform">
                  <PhoneOff className="h-4 w-4" />
                </button>
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={() => void accept()} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white active:scale-90 transition-transform">
                  <Phone className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={toggleMic} className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-all ${micEnabled ? "bg-white/15" : "bg-red-500"}`}>
                  {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
                <button type="button" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={() => void hangup()} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white active:scale-90 transition-transform">
                  <PhoneOff className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </Draggable>
    );
  }

  // ─── Full-screen overlay ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "linear-gradient(160deg,#0f0f1a 0%,#1a0d22 50%,#0d1a1a 100%)" }}>
      {/* Minimize button */}
      {state.kind !== "answered_elsewhere" && (
        <button
          className="absolute top-12 right-5 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-colors"
          onClick={() => setMinimized(true)}
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      )}

      {/* ── Incoming call ── */}
      {state.kind === "incoming" && (
        <div className="flex flex-col items-center justify-between h-full px-8 pt-20 pb-16">
          <div className="flex flex-col items-center gap-4 flex-1 justify-center">
            <Avatar label={state.fromLabel} size="lg" />
            <div className="text-center mt-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">{state.fromLabel}</h2>
              <p className="mt-2 text-gray-400 text-base">{state.media === "video" ? "Incoming video call…" : "Incoming voice call…"}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-16 w-full">
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={() => void decline()} className="h-20 w-20 flex items-center justify-center rounded-full bg-red-500 shadow-2xl shadow-red-500/40 active:scale-90 transition-transform">
                <PhoneOff className="h-9 w-9 text-white" />
              </button>
              <span className="text-xs text-gray-400 font-medium">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={() => void accept()} className="h-20 w-20 flex items-center justify-center rounded-full bg-green-500 shadow-2xl shadow-green-500/40 active:scale-90 transition-transform">
                <Phone className="h-9 w-9 text-white" />
              </button>
              <span className="text-xs text-gray-400 font-medium">Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Outgoing call ── */}
      {state.kind === "outgoing" && (
        <div className="flex flex-col items-center justify-between h-full px-8 pt-20 pb-16">
          <div className="flex flex-col items-center gap-4 flex-1 justify-center">
            <Avatar label={state.toLabel} size="lg" />
            <div className="text-center mt-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">{state.toLabel}</h2>
              <p className="mt-2 text-gray-400 text-base animate-pulse">Calling…</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => void hangup()} className="h-20 w-20 flex items-center justify-center rounded-full bg-red-500 shadow-2xl shadow-red-500/40 active:scale-90 transition-transform">
              <PhoneOff className="h-9 w-9 text-white" />
            </button>
            <span className="text-xs text-gray-400 font-medium">Cancel</span>
          </div>
        </div>
      )}

      {/* ── In call ── */}
      {state.kind === "inCall" && (
        <div className="flex flex-col h-full w-full relative">
          {/* Remote video / audio visual */}
          <div className="flex-1 relative overflow-hidden">
            {state.media === "video" ? (
              <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                <audio ref={remoteAudioRef} autoPlay playsInline />
                {/* Animated audio visualiser rings */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-48 w-48 rounded-full border-2 border-white/5 animate-ping [animation-duration:2s]" />
                  <div className="absolute h-36 w-36 rounded-full border-2 border-white/8 animate-ping [animation-duration:2.4s] [animation-delay:0.5s]" />
                  <div className="h-28 w-28 grid place-items-center rounded-full bg-gradient-to-br from-rose-200 to-pink-300 text-4xl font-bold text-rose-600 shadow-2xl">
                    {initials(state.peerLabel)}
                  </div>
                </div>
                <h2 className="mt-6 text-2xl font-bold text-white">{state.peerLabel}</h2>
                <p className="mt-1 font-mono text-lg text-white/60">{formatElapsed(elapsedMs)}</p>
              </div>
            )}

            {/* Local video PIP */}
            {state.media === "video" && state.localStream && (
              <div className={`absolute top-14 right-4 w-[90px] rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl aspect-[9/16] ${usingFrontCamera ? "scale-x-[-1]" : ""}`}>
                <video
                  autoPlay playsInline muted
                  ref={(el) => { if (el && state.localStream && el.srcObject !== state.localStream) el.srcObject = state.localStream; }}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Top info overlay for video */}
            {state.media === "video" && (
              <div className="absolute top-5 left-5 flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2.5 rounded-2xl">
                <div className="h-8 w-8 grid place-items-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">{initials(state.peerLabel)}</div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">{state.peerLabel}</p>
                  <p className="text-xs font-mono text-white/50 mt-0.5">{formatElapsed(elapsedMs)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="shrink-0 pb-safe pt-5 pb-10 flex flex-col items-center gap-4 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0">
            {/* Status chip */}
            {!micEnabled && (
              <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs font-semibold text-red-300 backdrop-blur-sm">
                <MicOff className="h-3.5 w-3.5" /> Microphone muted
              </div>
            )}

            <div className="flex items-center justify-center gap-4 flex-wrap px-8">
              <ControlButton onClick={toggleMic} active={micEnabled} title={micEnabled ? "Mute mic" : "Unmute mic"}>
                {micEnabled ? <Mic /> : <MicOff />}
              </ControlButton>

              {state.media === "video" && (
                <>
                  <ControlButton onClick={toggleCam} active={camEnabled} title={camEnabled ? "Turn camera off" : "Turn camera on"}>
                    {camEnabled ? <Video /> : <VideoOff />}
                  </ControlButton>
                  <ControlButton onClick={flipCamera} title="Flip camera">
                    <RotateCcw />
                  </ControlButton>
                </>
              )}

              <ControlButton onClick={toggleSpeaker} active={speakerEnabled} title={speakerEnabled ? "Turn speaker off" : "Turn speaker on"}>
                {speakerEnabled ? <Volume2 /> : <VolumeX />}
              </ControlButton>

              {outputDevices.length > 1 && (
                <div className="relative">
                  <ControlButton onClick={() => setShowDevicePicker(!showDevicePicker)} title="Select audio output">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </ControlButton>
                  {showDevicePicker && (
                    <div
                      className="absolute bottom-full mb-2 right-0 bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl min-w-[180px]"
                      onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
                    >
                      {outputDevices.map((d) => (
                        <button
                          key={d.deviceId}
                          type="button"
                          className={`w-full text-left px-4 py-3 text-sm transition-colors ${currentOutputDevice === d.deviceId ? "text-white bg-white/10 font-semibold" : "text-gray-400 hover:bg-white/5"}`}
                          onClick={() => { switchOutputDevice(d.deviceId); setCurrentOutputDevice(d.deviceId); setShowDevicePicker(false); }}
                        >
                          {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <ControlButton onClick={() => void hangup()} danger title="End call" size="lg">
                <PhoneOff />
              </ControlButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Answered elsewhere ── */}
      {state.kind === "answered_elsewhere" && (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
          <div className="h-24 w-24 grid place-items-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 text-3xl font-bold text-rose-600 shadow-xl">
            {initials(state.peerLabel)}
          </div>
          <h2 className="text-2xl font-bold text-white">{state.peerLabel}</h2>
          <p className="text-gray-400">In call on another device</p>
        </div>
      )}
    </div>
  );
}
