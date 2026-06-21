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
  Minimize2,
  Maximize2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { initials, formatElapsed } from "@/lib/utils";
import Draggable from "react-draggable";
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
  const [minimized, setMinimized] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const getElapsedMs = () => {
    if (state.kind !== "inCall") return 0;
    return tick - new Date(state.connectedAt).getTime();
  };

  // mic toggle now handled via context hook
// Removed local toggle functions; using context functions directly


  const toggleCameraFlip = async () => {
    if ("mediaStream" in state && state.mediaStream) {
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

  useEffect(() => {
    if (state.kind === "incoming" || state.kind === "outgoing") {
      setMinimized(false);
    }
  }, [state.kind]);

  if (state.kind === "idle") {
    return null;
  }
  return (
    <Draggable disabled={!minimized} bounds="body" nodeRef={nodeRef} position={minimized ? undefined : {x:0, y:0}}>
      <div ref={nodeRef} className={minimized 
        ? "fixed bottom-20 right-6 z-[100] w-64 h-[22rem] bg-gray-900 shadow-2xl rounded-2xl overflow-hidden cursor-move flex flex-col ring-1 ring-white/10" 
        : "fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md"}>
        
        {state.kind !== "answered_elsewhere" && (
          <button 
            className={`absolute z-50 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-opacity ${minimized ? 'top-2 right-2' : 'top-6 right-6'}`}
            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            title={minimized ? "Maximize" : "Minimize"}
          >
            {minimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
          </button>
        )}

      {state.kind === "incoming" && (
        <div className={`flex flex-col items-center justify-center h-full w-full ${minimized ? 'p-4' : 'px-8 py-12'}`}>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`grid place-items-center rounded-full bg-rose-100 font-semibold text-rose-600 shadow-lg ${minimized ? 'h-20 w-20 text-2xl mb-4' : 'h-36 w-36 text-4xl mb-6'}`}>
              {initials(state.fromLabel)}
            </div>
            <h3 className={`font-semibold text-white mb-1 text-center ${minimized ? 'text-xl' : 'text-3xl'}`}>{state.fromLabel}</h3>
            {!minimized && <p className="text-gray-400 text-lg">{state.media === "video" ? "Incoming video call" : "Incoming voice call"}</p>}
          </div>
          <div className={`flex justify-center ${minimized ? 'gap-6 mb-2' : 'gap-16 mb-8'}`}>
            <button className={`focus-ring inline-flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:scale-105 transition-transform ${minimized ? 'h-12 w-12' : 'h-20 w-20'}`} onClick={() => void decline()} type="button">
              <PhoneOff className={minimized ? "h-6 w-6" : "h-10 w-10"} />
            </button>
            <button className={`focus-ring inline-flex items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:scale-105 transition-transform ${minimized ? 'h-12 w-12' : 'h-20 w-20'}`} onClick={() => void accept()} type="button">
              <Phone className={minimized ? "h-6 w-6" : "h-10 w-10"} />
            </button>
          </div>
        </div>
      )}
      {state.kind === "outgoing" && (
        <div className={`flex flex-col items-center justify-center h-full w-full ${minimized ? 'p-4' : 'px-8 py-12'}`}>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`grid place-items-center rounded-full bg-rose-100 font-semibold text-rose-600 shadow-lg ${minimized ? 'h-20 w-20 text-2xl mb-4' : 'h-36 w-36 text-4xl mb-6'}`}>
              {initials(state.toLabel)}
            </div>
            <h3 className={`font-semibold text-white mb-1 text-center ${minimized ? 'text-xl' : 'text-3xl'}`}>{state.toLabel}</h3>
            <p className="text-gray-400 text-sm">Calling...</p>
            {!minimized && <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">If this takes too long, they might be offline or busy.</p>}
          </div>
          <div className={`flex justify-center ${minimized ? 'mb-2' : 'mb-8'}`}>
            <button className={`focus-ring inline-flex items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:scale-105 transition-transform ${minimized ? 'h-12 w-12' : 'h-20 w-20'}`} onClick={() => void hangup()} type="button">
              <PhoneOff className={minimized ? "h-6 w-6" : "h-10 w-10"} />
            </button>
          </div>
        </div>
      )}
      {state.kind === "inCall" && (
        <div className="w-full h-full relative flex flex-col">
          <div className="flex-1 relative bg-gray-900 overflow-hidden">
            {state.media === "video" ? (
              <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                <audio ref={remoteAudioRef} autoPlay playsInline />
                <div className={`grid place-items-center rounded-full bg-rose-100 font-semibold text-rose-600 shadow-lg ${minimized ? 'h-20 w-20 text-2xl mb-4' : 'h-36 w-36 text-4xl mb-6'}`}>
                  {initials(state.peerLabel)}
                </div>
                {!minimized && <h3 className="text-3xl font-semibold text-white mb-2">{state.peerLabel}</h3>}
                <p className="text-gray-400">{state.kind === "inCall" ? formatElapsed(getElapsedMs()) : "0:00"}</p>
              </div>
            )}
            {state.media === "video" && state.mediaStream && (
              <div className={`absolute ${minimized ? 'bottom-2 right-2 w-1/3' : 'top-4 right-4 w-[30%]'} overflow-hidden rounded-xl border-2 border-white/30 bg-black/40 shadow-lg aspect-[9/16] ${usingFrontCamera ? "scale-x-[-1]" : ""}`}>
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
            {!minimized && (
              <div className="absolute top-6 left-6 text-white bg-black/40 px-4 py-2 rounded-2xl backdrop-blur-sm">
                <h3 className="text-2xl font-semibold">{state.peerLabel}</h3>
                <p className="text-gray-300 font-mono">{state.kind === "inCall" ? formatElapsed(getElapsedMs()) : "0:00"}</p>
              </div>
            )}
            {minimized && state.media === "video" && (
              <div className="absolute top-2 left-2 p-1 bg-black/40 rounded-lg text-white text-xs px-2 truncate max-w-[120px]">
                {state.peerLabel}
              </div>
            )}
          </div>
          <div className={minimized ? "h-14 bg-gray-800 flex items-center justify-around px-2 shrink-0" : "absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6 px-4"}>
            <button className={`focus-ring inline-flex items-center justify-center rounded-full text-white ${minimized ? 'h-10 w-10' : 'h-16 w-16 bg-gray-800/80 hover:bg-gray-700/80'} ${minimized && !micEnabled ? 'bg-red-500' : ''}`} onClick={toggleMic} type="button" title={micEnabled ? "Mute microphone" : "Unmute microphone"} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              {micEnabled ? <Mic className={minimized ? "h-5 w-5" : "h-7 w-7"} /> : <MicOff className={minimized ? "h-5 w-5" : "h-7 w-7"} />}
            </button>
            {state.media === "video" && !minimized && (
              <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleCam} type="button" title={camEnabled ? "Turn camera off" : "Turn camera on"} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                {camEnabled ? <Video className="h-7 w-7" /> : <VideoOff className="h-7 w-7" />}
              </button>
            )}
            {state.media === "video" && !minimized && (
              <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleCameraFlip} type="button" title="Flip camera" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                <RotateCcw className="h-7 w-7" />
              </button>
            )}
            {!minimized && (
              <>
                <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={toggleSpeaker} type="button" title={speakerEnabled ? "Turn speaker off" : "Turn speaker on"} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                  {speakerEnabled ? <Volume2 className="h-7 w-7" /> : <VolumeX className="h-7 w-7" />}
                </button>
                <button className="focus-ring inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-800/80 text-white hover:bg-gray-700/80" onClick={() => setShowDeviceSelector(!showDeviceSelector)} type="button" title="Select audio output" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
                {showDeviceSelector && (
                  <div onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                    <select value={localCurrentOutputDevice} onChange={(e) => { switchOutputDevice(e.target.value); setShowDeviceSelector(false); }} className="ml-2 bg-gray-800 text-white rounded absolute bottom-28">
                      {localOutputDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            <button className={`focus-ring inline-flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 ${minimized ? 'h-10 w-10' : 'h-16 w-16'}`} onClick={() => void hangup()} type="button" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <PhoneOff className={minimized ? "h-5 w-5" : "h-7 w-7"} />
            </button>
          </div>
        </div>
      )}
      {state.kind === "answered_elsewhere" && (
        <div className="flex flex-col items-center justify-center h-full w-full px-8 py-12">
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="grid h-36 w-36 place-items-center rounded-full bg-rose-100 text-4xl font-semibold text-rose-600 shadow-lg mb-6">
              {initials(state.peerLabel)}
            </div>
            <h3 className="text-3xl font-semibold text-white mb-2">{state.peerLabel}</h3>
            <p className="text-gray-400 text-lg">In call with {state.peerLabel}</p>
            <p className="text-gray-500 text-sm mt-2 text-center">Active on another device</p>
          </div>
        </div>
      )}
      </div>
    </Draggable>
  );
}
