"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BrandProps {
  size?: "sm" | "md" | "lg";
  showLogo?: boolean;
  className?: string;
}

export function Brand({ size = "md", showLogo = true, className }: BrandProps) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  };

  const heartSizes = {
    sm: 16,
    md: 24,
    lg: 36,
  };

  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      {showLogo && (
        <Heart
          size={heartSizes[size]}
          className="text-rose-500 fill-rose-500 animate-pulse"
        />
      )}
      <span
        className={cn(
          "font-bold bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent",
          sizeClasses[size],
        )}
      >
        LoverLink
      </span>
    </Link>
  );
}
