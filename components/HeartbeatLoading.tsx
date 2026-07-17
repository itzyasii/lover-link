"use client";

import { useEffect, useRef, useState } from "react";
import type { DotLottiePlayer } from "@dotlottie/player-component";

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
  const playerRef = useRef<DotLottiePlayer>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Dynamically import the client-side only module
    import("@dotlottie/player-component").then(() => {
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (isLoaded && playerRef.current) {
      // Small delay to ensure player is fully initialized
      setTimeout(() => {
        playerRef.current?.play();
      }, 100);
    }
  }, [isLoaded]);

  const containerClass = fullScreen
    ? "fixed inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex flex-col items-center justify-center z-50"
    : "flex flex-col items-center justify-center p-8";

  return (
    <div className={containerClass}>
      {isLoaded && (
        <dotlottie-player
          ref={playerRef}
          style={{ width: size, height: size }}
          loop={true}
          autoplay={true}
          src="/heartbeat.lottie"
        />
      )}
      {!isLoaded && (
        <div
          style={{ width: size, height: size }}
          className="bg-rose-200 rounded-full animate-pulse flex items-center justify-center"
        >
          <span className="text-4xl">❤️</span>
        </div>
      )}
      {message && (
        <p className="mt-4 text-rose-500 font-medium animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}
