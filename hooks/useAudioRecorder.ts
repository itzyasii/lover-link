import { useState, useRef, useCallback, useEffect } from "react";
import { useToastStore } from "@/stores/toast";

export type RecorderState = "idle" | "preparing" | "recording" | "paused" | "stopped";

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const { addToast } = useToastStore();

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const cleanupMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      setState("preparing");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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
      setDuration(0);
      setAudioBlob(null);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
        }
      };

      // We don't define onstop here anymore. It's defined in stop() to capture the Promise.

      recorder.start();
      setState("recording");
      startTimer();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      addToast(
        "Could not access microphone. Please check permissions.",
        "error",
      );
    }
  }, [addToast, startTimer]);

  const pause = useCallback(() => {
    if (mediaRecorder.current) {
      try {
        if (mediaRecorder.current.state === "recording") {
          mediaRecorder.current.pause();
          setState("paused");
          stopTimer();
        }
      } catch (e) {
        console.error("Error pausing:", e);
      }
    }
  }, [stopTimer]);

  const resume = useCallback(() => {
    if (mediaRecorder.current) {
      try {
        if (mediaRecorder.current.state === "paused") {
          mediaRecorder.current.resume();
          setState("recording");
          startTimer();
        }
      } catch (e) {
        console.error("Error resuming:", e);
      }
    }
  }, [startTimer]);

  const stop = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      if (mediaRecorder.current) {
        try {
          if (mediaRecorder.current.state !== "inactive") {
            const mimeType = mediaRecorder.current.mimeType;
            
            mediaRecorder.current.onstop = () => {
              const blob = new Blob(chunks.current, { type: mimeType });
              setAudioBlob(blob);
              cleanupMedia(); // Clean up only AFTER file is fully written
              resolve(blob);
            };

            mediaRecorder.current.stop();
          } else {
            resolve(audioBlob);
          }
        } catch (e) {
          console.error("Error stopping:", e);
          resolve(null);
        }

        setState("stopped");
        stopTimer();
      } else {
        resolve(audioBlob);
      }
    });
  }, [stopTimer, cleanupMedia, audioBlob]);

  const cancel = useCallback(() => {
    if (mediaRecorder.current) {
      // Nullify onstop so it doesn't accidentally save a blob when cancelled
      mediaRecorder.current.onstop = null;
      try {
        if (mediaRecorder.current.state !== "inactive") {
          mediaRecorder.current.stop();
        }
      } catch (e) {
        console.error("Error stopping:", e);
      }
    }

    cleanupMedia();
    chunks.current = [];
    setDuration(0);
    setAudioBlob(null);
    setState("idle");
  }, [cleanupMedia]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  return {
    state,
    duration,
    audioBlob,
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
