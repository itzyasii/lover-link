import { useState, useRef, useCallback, useEffect } from "react";
import { useToastStore } from "@/stores/toast";

export type RecorderState = "idle" | "recording" | "paused" | "stopped";

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [waveformData, setWaveformData] = useState<Float32Array>(
    new Float32Array(0),
  );
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const { addToast } = useToastStore();

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const animationFrame = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const accumulatedTime = useRef(0);
  const chunks = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const updateWaveformRef = useRef<(() => void) | null>(null);

  const updateWaveform = useCallback(() => {
    if (!analyser.current || state !== "recording") return;

    const bufferLength = analyser.current.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    analyser.current.getFloatTimeDomainData(dataArray);

    setWaveformData(dataArray);
    animationFrame.current = requestAnimationFrame(updateWaveformRef.current!);
  }, [state]);

  useEffect(() => {
    updateWaveformRef.current = updateWaveform;
  }, [updateWaveform]);

  const startTimer = useCallback(() => {
    startTime.current = performance.now();
    const tick = () => {
      if (state === "recording" && startTime.current !== null) {
        setDuration(
          accumulatedTime.current +
            (performance.now() - startTime.current) / 1000,
        );
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [state]);

  useEffect(() => {
    if (state === "recording") {
      updateWaveform();
      startTimer();
    } else if (state === "paused" && startTime.current !== null) {
      accumulatedTime.current += (performance.now() - startTime.current) / 1000;
      startTime.current = null;
    }

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [state, updateWaveform, startTimer]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      audioContext.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128; // gives 64 bins for waveform
      source.connect(analyserNode);
      analyser.current = analyserNode;

      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      let selectedMimeType = "";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      if (!selectedMimeType) {
        addToast("Voice recording is not supported in this browser.", "error");
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
      });
      mediaRecorder.current = recorder;
      chunks.current = [];
      accumulatedTime.current = 0;
      setDuration(0);
      setAudioBlob(null);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: selectedMimeType });
        setAudioBlob(blob);
      };

      recorder.start(100); // chunk every 100ms
      setState("recording");
    } catch (err) {
      console.error("Error accessing microphone:", err);
      addToast(
        "Could not access microphone. Please check permissions.",
        "error",
      );
    }
  }, [addToast]);

  const pause = useCallback(() => {
    if (mediaRecorder.current && state === "recording") {
      mediaRecorder.current.pause();
      setState("paused");
    }
  }, [state]);

  const resume = useCallback(() => {
    if (mediaRecorder.current && state === "paused") {
      mediaRecorder.current.resume();
      setState("recording");
    }
  }, [state]);

  const stop = useCallback(() => {
    if (
      mediaRecorder.current &&
      (state === "recording" || state === "paused")
    ) {
      mediaRecorder.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContext.current && audioContext.current.state !== "closed") {
        audioContext.current.close().catch(console.error);
      }
      setState("stopped");

      if (startTime.current !== null) {
        accumulatedTime.current +=
          (performance.now() - startTime.current) / 1000;
        startTime.current = null;
      }
    }
  }, [state]);

  const cancel = useCallback(() => {
    if (
      mediaRecorder.current &&
      (state === "recording" || state === "paused" || state === "stopped")
    ) {
      if (state !== "stopped") {
        mediaRecorder.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContext.current && audioContext.current.state !== "closed") {
        audioContext.current.close().catch(console.error);
      }
      chunks.current = [];
      accumulatedTime.current = 0;
      setDuration(0);
      setAudioBlob(null);
      setState("idle");
    } else if (state === "stopped") {
      chunks.current = [];
      accumulatedTime.current = 0;
      setDuration(0);
      setAudioBlob(null);
      setState("idle");
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContext.current && audioContext.current.state !== "closed") {
        audioContext.current.close().catch(console.error);
      }
    };
  }, []);

  return {
    state,
    duration,
    waveformData,
    audioBlob,
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
