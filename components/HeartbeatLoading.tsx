"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { useLoadingStore } from "@/stores/loading";

export function HeartbeatLoading() {
  const mutating = useIsMutating();
  const manual = useLoadingStore((s) => s.count);
  const busy = mutating + manual > 0;

  const [visible, setVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!busy) {
      // Add a 500ms delay before hiding to prevent flickering from rapid state changes
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => setVisible(false), 500);
      return;
    }

    // If we're now busy, cancel any pending hide and show after 200ms
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    const id = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(id);
  }, [busy]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    void import("@lottiefiles/dotlottie-wc")
      .then(() => setPlayerReady(true))
      .catch(() => setPlayerReady(true));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-black/20 p-6">
      <div className="grid place-items-center">
        {playerReady ? (
          <dotlottie-wc
            src="/heartbeat.lottie"
            autoplay
            loop
            className="h-24 w-24 drop-shadow-[0_10px_30px_rgba(198,43,105,0.28)]"
          />
        ) : (
          <div className="h-24 w-24" />
        )}
      </div>
    </div>
  );
}
