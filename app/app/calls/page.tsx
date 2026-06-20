"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  MessageCircle,
  Phone,
  PhoneOff,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getCachedUserLabel, resolveUserLabels } from "@/lib/users";
import { useAuthStore } from "@/stores/auth";

type Call = {
  id: string;
  callId: string;
  callerId: string;
  calleeId: string;
  media?: "audio" | "video";
  status:
    | "ringing"
    | "answered"
    | "ended"
    | "missed"
    | "declined"
    | "cancelled"
    | string;
  offeredAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  duration?: number;
  reason?: string | null;
};

const EMPTY_CALLS: Call[] = [];

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

function safeMs(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const d = y - x;
  return d < 0 ? null : d;
}

function callDuration(call: Call) {
  if (typeof call.duration === "number")
    return formatDuration(call.duration * 1000);
  const ms = safeMs(call.answeredAt, call.endedAt);
  return ms == null ? "" : formatDuration(ms);
}

export default function CallsPage() {
  const me = useAuthStore((s) => s.user);
  const [labelsVersion, setLabelsVersion] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["calls"],
    queryFn: () => apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
    retry: false, // Don't retry on 404
  });

  const calls = data?.calls ?? EMPTY_CALLS;

  const allUserIds = useMemo(() => {
    const ids: string[] = [];
    for (const c of calls) {
      if (c.callerId) ids.push(c.callerId);
      if (c.calleeId) ids.push(c.calleeId);
    }
    return Array.from(new Set(ids));
  }, [calls]);

  useEffect(() => {
    if (allUserIds.length === 0) return;
    void resolveUserLabels(allUserIds)
      .then(() => setLabelsVersion((x) => x + 1))
      .catch(() => {});
  }, [allUserIds]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-800">
          Calls
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Recent voice and video calls.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-gray-500">Loading your calls...</div>
      ) : error ? (
        <div className="mt-6 rounded-3xl bg-white/80 px-6 py-10 text-center shadow-sm">
          <Phone className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            Call history coming soon
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Your recent voice and video calls will appear here once the feature
            is fully enabled.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
          >
            <MessageCircle className="h-4 w-4" />
            Go to messages
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {calls.map((call) => {
            const isOutgoing = Boolean(me?.id) && call.callerId === me?.id;
            const otherId = isOutgoing ? call.calleeId : call.callerId;
            const otherLabel = getCachedUserLabel(otherId) ?? otherId;
            const media = call.media === "video" ? "video" : "audio";
            const duration = callDuration(call);
            const missed =
              call.status === "missed" ||
              call.status === "declined" ||
              call.status === "cancelled" ||
              !call.answeredAt;
            const statusLabel = missed
              ? call.status === "declined"
                ? "You declined"
                : call.status === "cancelled"
                  ? "Cancelled"
                  : "Missed call"
              : duration || "Call ended";

            return (
              <div
                key={call.id}
                className="flex items-center justify-between gap-4 rounded-3xl border border-gray-100 bg-white/80 px-4 py-4 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${
                      missed
                        ? "bg-red-100 text-red-600"
                        : "bg-green-100 text-green-600"
                    }`}
                    aria-hidden="true"
                  >
                    {isOutgoing ? (
                      <ArrowUpRight className="h-6 w-6" />
                    ) : (
                      <ArrowDownLeft className="h-6 w-6" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="truncate text-base font-semibold text-gray-800">
                        {otherLabel}
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                        {media === "video" ? (
                          <Video className="h-3.5 w-3.5" />
                        ) : (
                          <Phone className="h-3.5 w-3.5" />
                        )}
                        {media === "video" ? "Video call" : "Voice call"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span>{isOutgoing ? "You called" : "Called you"}</span>
                      <span>•</span>
                      <span className="tabular-nums">
                        {new Date(call.offeredAt).toLocaleString()}
                      </span>
                      {duration && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span className="tabular-nums">{duration}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                    missed
                      ? "bg-red-100 text-red-600"
                      : "bg-green-100 text-green-700"
                  }`}
                  title={call.reason ?? call.status}
                >
                  {missed ? <PhoneOff className="h-4 w-4" /> : null}
                  {statusLabel}
                </div>
              </div>
            );
          })}

          {!error && calls.length === 0 ? (
            <div className="rounded-3xl bg-white/80 px-6 py-12 text-center shadow-sm">
              <Phone className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                No calls yet
              </h3>
              <p className="text-gray-500">
                Your voice and video call history will appear here.
              </p>
            </div>
          ) : null}
        </div>
      )}

      <span className="sr-only">{labelsVersion}</span>
    </div>
  );
}
