import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

// Call manager types
export type AcceptCallParams = { callId: string };
export type DeclineCallParams = { callId: string };
export type HangupCallParams = { callId: string };

export type CallState =
  | { kind: "idle" }
  | {
      kind: "incoming";
      from: string;
      fromLabel: string;
      callId: string;
      media: "audio" | "video";
      offer: RTCSessionDescriptionInit;
      mediaStream?: MediaStream;
    }
  | {
      kind: "outgoing";
      to: string;
      toLabel: string;
      callId: string;
      media: "audio" | "video";
      mediaStream?: MediaStream;
    }
  | {
      kind: "inCall";
      peer: string;
      peerLabel: string;
      callId: string;
      media: "audio" | "video";
      connectedAt: string;
      localStream: MediaStream;
      remoteStream: MediaStream;
      mediaStream?: MediaStream;
    }
  | {
      kind: "answered_elsewhere";
      callId: string;
      peerLabel: string;
      connectedAt: string;
    };
