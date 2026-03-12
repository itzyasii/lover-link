"use client";

import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useCall } from "./CallProvider";

export function CallOverlay() {
  const { state, accept, decline, hangup, toggleMic, toggleCam, micEnabled, camEnabled } = useCall();

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (state.kind === "inCall") {
      if (localRef.current) localRef.current.srcObject = state.localStream;
      if (remoteRef.current) remoteRef.current.srcObject = state.remoteStream;
    }
  }, [state]);

  if (state.kind === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="glass w-full max-w-3xl rounded-3xl p-5">
        {state.kind === "incoming" ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--wine-900)]">Incoming call</div>
              <div className="text-xs text-black/55">From {state.fromLabel}</div>
              <div className="text-xs text-black/55 capitalize">{state.media} call</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="focus-ring rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                onClick={() => void accept()}
              >
                Accept
              </button>
              <button
                className="focus-ring rounded-2xl bg-black/5 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                onClick={() => void decline()}
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}

        {state.kind === "outgoing" ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--wine-900)]">Calling…</div>
              <div className="text-xs text-black/55">To {state.toLabel}</div>
              <div className="text-xs text-black/55 capitalize">{state.media} call</div>
            </div>
            <button
              className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
              onClick={() => void hangup()}
            >
              <PhoneOff className="h-4 w-4" /> Cancel
            </button>
          </div>
        ) : null}

        {state.kind === "inCall" ? (
          <div className="mt-4 grid gap-3">
            <div className="text-xs font-semibold text-black/60">In call with {state.peerLabel}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <video ref={remoteRef} autoPlay playsInline className="w-full rounded-3xl bg-black/10" />
              {state.media === "video" ? (
                <video ref={localRef} autoPlay muted playsInline className="w-full rounded-3xl bg-black/10" />
              ) : (
                <div className="grid place-items-center rounded-3xl bg-black/5 p-8 text-sm text-black/60">
                  Audio only
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                onClick={toggleMic}
              >
                {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {micEnabled ? "Mute" : "Unmute"}
              </button>
              {state.media === "video" ? (
                <button
                  className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  onClick={toggleCam}
                >
                  {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  {camEnabled ? "Camera off" : "Camera on"}
                </button>
              ) : null}
              <button
                className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
                onClick={() => void hangup()}
              >
                <PhoneOff className="h-4 w-4" /> Hang up
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
