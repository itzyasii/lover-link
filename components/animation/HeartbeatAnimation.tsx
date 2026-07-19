"use client";

import { useEffect, useRef, useState } from "react";
import type { DotLottiePlayer } from "@dotlottie/player-component";
import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { heartbeatLottieUrl, heartbeatSvgUrl } from "./index";

interface HeartbeatAnimationProps {
  size?: number;
}

export function HeartbeatAnimation({ size = 120 }: HeartbeatAnimationProps) {
  const playerRef = useRef<DotLottiePlayer>(null);
  const [animationError, setAnimationError] = useState(false);
  const [useSvgFallback, setUseSvgFallback] = useState(false);

  useEffect(() => {
    // Dynamically import the client-side only module
    import("@dotlottie/player-component")
      .then(() => {
        // Small delay to ensure player is fully initialized in the DOM
        setTimeout(() => {
          try {
            playerRef.current?.play();
          } catch (e) {
            console.warn(
              "[HeartbeatAnimation] Failed to play lottie animation:",
              e,
            );
            setAnimationError(true);
          }
        }, 100);
      })
      .catch((e) => {
        console.warn("[HeartbeatAnimation] Failed to load lottie player:", e);
        setAnimationError(true);
      });
  }, []);

  const handleSvgError = () => {
    console.warn(
      "[HeartbeatAnimation] Failed to load SVG animation, falling back to lucide heart",
    );
    setUseSvgFallback(true);
  };

  return (
    <>
      {!animationError ? (
        // Primary: Lottie animation from components/animation folder
        <dotlottie-player
          ref={playerRef}
          style={{ width: size, height: size }}
          loop={true}
          autoplay={true}
          src={heartbeatLottieUrl}
          onError={() => setAnimationError(true)}
        />
      ) : !useSvgFallback ? (
        // First fallback: SVG animation from public/animation folder (Next.js standard static file serving)
        <div style={{ width: size, height: size }}>
          <Image
            src={heartbeatSvgUrl}
            alt="Loading heartbeat"
            width={size}
            height={size}
            className="w-full h-full"
            onError={handleSvgError}
            priority
          />
        </div>
      ) : (
        // Final fallback: Lucide heart with Framer Motion animation
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ width: size, height: size }}
          className="flex items-center justify-center"
        >
          <Heart className="w-full h-full text-rose-500 fill-rose-500" />
        </motion.div>
      )}
    </>
  );
}
