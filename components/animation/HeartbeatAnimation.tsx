"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
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
    let isMounted = true;

    const loadPlayer = async () => {
      try {
        // Import and register the player component
        await import("@dotlottie/player-component");

        if (!isMounted) return;

        // Try to play immediately, with multiple attempts if needed
        const tryPlay = (attempts = 0) => {
          if (playerRef.current) {
            try {
              playerRef.current.play();
            } catch (e) {
              if (attempts < 3 && isMounted) {
                // Retry a few times before giving up
                setTimeout(() => tryPlay(attempts + 1), 200);
              } else if (isMounted) {
                setAnimationError(true);
              }
            }
          } else if (attempts < 3 && isMounted) {
            // Player ref not ready yet, retry
            setTimeout(() => tryPlay(attempts + 1), 200);
          } else if (isMounted) {
            setAnimationError(true);
          }
        };

        tryPlay();
      } catch (e) {
        if (isMounted) {
          setAnimationError(true);
        }
      }
    };

    loadPlayer();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSvgError = () => {
    setUseSvgFallback(true);
  };

  const handleLottieError = (e: SyntheticEvent<HTMLElement>) => {
    setAnimationError(true);
  };

  return (
    <>
      {!animationError ? (
        // Primary: Lottie animation from public root (fixed path)
        <dotlottie-player
          ref={playerRef}
          style={{ width: size, height: size }}
          loop={true}
          autoplay={true}
          src={heartbeatLottieUrl}
          onError={handleLottieError}
        />
      ) : !useSvgFallback ? (
        // First fallback: SVG animation from public/animation folder
        <div style={{ width: size, height: size }}>
          <Image
            src={heartbeatSvgUrl}
            alt="Loading heartbeat"
            width={size}
            height={size}
            className="w-full h-full object-contain"
            onError={handleSvgError}
            priority
            unoptimized // SVG doesn't need optimization
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
