// "use client"

// Removed unused CallState import
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { initials, formatElapsed } from "@/lib/utils";

// CallOverlay now consumes CallContext directly via useCall hook

import { useCall } from "@/components/call/CallProvider";

export function CallOverlay() {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const deviceSelectorRef = useRef<HTMLDivElement>(null);


  const { state, accept, decline, hangup, toggleMic, toggleCam, toggleSpeaker, micEnabled, camEnabled, speakerEnabled, switchOutputDevice } = useCall();
  const [usingFrontCamera, setUsingFrontCamera] = useState(() => {
    const stored = localStorage.getItem('usingFrontCamera');
    return stored !== null ? JSON.parse(stored) : true;
  });

  const [localOutputDevices, setLocalOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [localCurrentOutputDevice, setLocalCurrentOutputDevice] = useState<string>("");
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [tick, setTick] = useState(() => Date.now());

  const getElapsedMs = () => {
    if (state.kind !== "inCall") return 0;
    return tick - new Date(state.connectedAt).getTime();
  };

  // mic toggle now handled via context hook
// Removed local toggle functions; using context functions directly


  const toggleCameraFlip = async () => {
    if (state.kind !== "idle" && state.mediaStream) {
      const videoTrack = state.mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const newFacing = usingFrontCamera ? "environment" : "user";
        try {
          await videoTrack.applyConstraints({ facingMode: newFacing });
          setUsingFrontCamera(!usingFrontCamera);
        } catch (err) {
          console.error("Failed to flip camera", err);
        }
      }
    }
  };

// Using context switchOutputDevice directly; local handling removed


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deviceSelectorRef.current && !deviceSelectorRef.current.contains(e.target as Node)) {
        setShowDeviceSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (state.kind === "inCall") {
      if (localRef.current && state.localStream) {
        localRef.current.srcObject = state.localStream;
      }
      if (remoteRef.current && state.remoteStream) {
        remoteRef.current.srcObject = state.remoteStream;
      }
      if (remoteAudioRef.current && state.remoteStream && state.media !== "video") {
        remoteAudioRef.current.srcObject = state.remoteStream;
      }
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
      setLocalOutputDevices(audioOutputs);
      if (audioOutputs.length > 0) {
        setLocalCurrentOutputDevice(audioOutputs[0].deviceId);
      }
    });
  }, [state]);

  useEffect(() => {
// Removed effect that set usingFrontCamera; initialization handled above.

  }, []);

  // Tick interval – runs for all states
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (state.kind === "idle") {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {state.kind === "incoming" && (
        <div className="flex flex-col items-center justify-center h-full w-full px-8 py-12">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="grid h-36 w-36 place-items-center rounded-full bg-rose-100 text-4xl font-semibold text-rose-600 shadow-lg mb-6">
              {initials(state.fromLabel)}
            </div>
            <h3 className="text-3xl font-semibold text-white mb-2">{state.fromLabel}</h3>
            <p className="text-gray-400 text-lg">{state.media === "video" ? "Incoming video call" : "Incoming voice call"}</p>
          </div>
          <div className="flex justify-center gap-16 mb-8">
            <button className="focus-ring inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:scale-105 transition-transform" onClick={() => void decline()} type="button">
              <PhoneOff className="h-10 w-10" />
            </button>
            <button className="focus-ring inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:scale-105 transition-transform" onClick={() => void accept()} type="button">
              <Phone className="h-10 w-10" />
            </button>
          </div>
        </div>
      )}
      {state.kind === "outgoing" && (
        <div className="flex flex-col items-center justify-center h-full w-full px-8 py-12">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="grid h-36 w-36 place-items-center rounded-full bg-rose-100 text-4xl font-semibold text-rose-600 shadow-lg mb-6">
              {initials(state.toLabel)}
            </div>
            <h3 className="text-3xl font-semibold text-white mb-2">{state.toLabel}</h3>
            <p className="text-gray-400 text-lg">{state.media === "video" ? "Calling..." : "Calling..."}</p>
            <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">If this takes too long, they might be offline or busy.</p>
          </div>
          <div className="flex justify-center gap-16 mb-8">
            <button className="focus-ring inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-5
00 text-white shadow-lg hover:scale-105 transition-transform" onClick={() => void hangup()} type="button">
              <PhoneOff className="h-10 w-10" />
            </button>
          </div>
        </div>
      )}
      {state.kind === "inCall" && (
        <div className="w-full h-full relative">
          {state.media === "video" ? (
            <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
              <audio ref={remoteAudioRef} autoPlay playsInline />
              <div className="grid h-36 w-36 place-items-center rounded-full bg-rose-100 text-4xl font-semibold text-rose-600 shadow-lg mb-6">
                {initials(state.peerLabel)}
              </div>
              <h3 className="text-3xl font-semibold text-white mb-2">{state.peerLabel}</h3>
              <p className="text-gray-400">{state.kind === "inCall" ? formatElapsed(getElapsedMs()) : "0:00"}</p>
            </div>
          )}
            {state.media === "video" && state.mediaStream && (
            <div className={`absolute top-4 right-4 w-[30%] overflow-hidden rounded-xl border-2 border-white/30 bg-black/40 shadow-lg aspect-9/16 ${usingFrontCamera ? "" : "scale-x-[-1]"}`}>
                <video
                  ref={(el) => {
                    if (el && state.mediaStream && el.srcObject !== state.mediaStream) {
                      el.srcObject = state.mediaStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
            </div>
            )}
          <div className="absolute top-6 left-6 text-white">
            <h3 className="text-2xl font-semibold">{state.peerLabel}</h3>
            <p className="text-gray-300">{state.kind === "inCall" ? formatElapsed(getElapsedMs()) : "0:00"}</p>
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6 px-4">
            <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleMic} type="button" title={micEnabled ? "Mute microphone" : "Unmute microphone"}>
              {micEnabled ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
            </button>
            {state.media === "video" && (
              <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleCam} type="button" title={camEnabled ? "Turn camera off" : "Turn camera on"}>
                {camEnabled ? <Video className="h-7 w-7" /> : <VideoOff className="h-7 w-7" />}
              </button>
            )}
            {state.media === "video" && (
              <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleCameraFlip} type="button" title="Flip camera">
                <RotateCcw className="h-7 w-7" />
              </button>
            )}
            <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleSpeaker} type="button" title={speakerEnabled ? "Turn speaker off" : "Turn speaker on"}>
              {speakerEnabled ? <Volume2 className="h-7 w-7" /> : <VolumeX className="h-7 w-7" />}
            </button>
            <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={() => setShowDeviceSelector(!showDeviceSelector)} type="button" title="Select audio output">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            {showDeviceSelector && (
              <select value={localCurrentOutputDevice} onChange={(e) => { switchOutputDevice(e.target.value); setShowDeviceSelector(false); }} className="ml-2 bg-gray-800 text-white rounded">
                {localOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
                ))}
              </select>
            )}
            <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600" onClick={() => void hangup()} type="button">
              <PhoneOff className="h-7 w-7" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
