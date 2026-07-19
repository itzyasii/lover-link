"use client";

import { HeartbeatAnimation } from "./animation";

interface HeartbeatLoadingProps {
  size?: number;
  message?: string;
  fullScreen?: boolean;
}

export function HeartbeatLoading({
  size = 120,
  message = "Connecting hearts...",
  fullScreen = false,
}: HeartbeatLoadingProps) {
  const containerClass = fullScreen
    ? "fixed inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex flex-col items-center justify-center z-50"
    : "flex flex-col items-center justify-center p-8";

  return (
    <div className={containerClass}>
      <HeartbeatAnimation size={size} />
      {message && (
        <p className="mt-4 text-rose-500 font-medium animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}
