"use client";

import Image from "next/image";
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

  const logoSizes = {
    sm: 24,
    md: 36,
    lg: 52,
  };

  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      {showLogo && (
        <Image
          src="/logo.svg"
          alt="LoverLink Logo"
          width={logoSizes[size]}
          height={logoSizes[size]}
          className="animate-pulse"
          priority
        />
      )}
      <span
        className={cn(
          "font-normal bg-linear-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent",
          sizeClasses[size],
        )}
        style={{ fontFamily: "var(--font-windsong), cursive" }}
      >
        Lover Link
      </span>
    </Link>
  );
}
