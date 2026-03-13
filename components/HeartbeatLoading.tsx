"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLoadingStore } from "@/stores/loading";

export function HeartbeatLoading() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const manual = useLoadingStore((s) => s.count);
  const busy = fetching + mutating + manual > 0;

  const [visible, setVisible] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    void import("@lottiefiles/dotlottie-wc")
      .then(() => setPlayerReady(true))
      .catch(() => setPlayerReady(true));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/20 p-6">
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
