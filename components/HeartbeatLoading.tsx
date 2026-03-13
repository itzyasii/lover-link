"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLoadingStore } from "@/stores/loading";

export function HeartbeatLoading() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const manual = useLoadingStore((s) => s.count);
  const busy = fetching + mutating + manual > 0;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(id);
  }, [busy]);

  useEffect(() => {
    // Registers the <dotlottie-player> web component.
    void import("@dotlottie/player-component");
  }, []);

  const label = useMemo(() => {
    if (!busy) return "";
    if (mutating > 0) return "Sending…";
    return "Loading…";
  }, [busy, mutating]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-6">
      <div className="glass grid w-full max-w-xs place-items-center gap-3 rounded-3xl p-6">
        <dotlottie-player
          src="/heartbeat.lottie"
          autoplay
          loop
          className="h-20 w-20"
        />
        <div className="text-sm font-semibold text-[color:var(--wine-900)]">
          {label}
        </div>
      </div>
    </div>
  );
}
