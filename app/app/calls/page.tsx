"use client";

import { apiFetch } from "@/lib/api";
import { getCachedUserLabel, resolveUserLabels } from "@/lib/users";
import { useAuthStore } from "@/stores/auth";
import { usePrefetchedQuery } from "@/hooks/usePrefetchedQuery";
import { ArrowDownLeft, ArrowUpRight, Clock, MessageCircle, Phone, PhoneOff, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Call = {
  id: string;
  callId: string;
  callerId: string;
  calleeId: string;
  media?: "audio" | "video";
  status: "ringing" | "answered" | "ended" | "missed" | "declined" | "cancelled" | string;
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
  if (typeof call.duration === "number") return formatDuration(call.duration * 1000);
  const ms = safeMs(call.answeredAt, call.endedAt);
  return ms == null ? "" : formatDuration(ms);
}

function formatCallTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface EnrichedCall {
  call: Call;
  isOutgoing: boolean;
  otherLabel: string;
  missed: boolean;
}

function CallCard({ call, isOutgoing, otherLabel, labelsVersion: _ }: EnrichedCall & { labelsVersion: number }) {
  const missed = call.status === "missed" || call.status === "declined" || call.status === "cancelled" || !call.answeredAt;
  const duration = callDuration(call);
  const media = call.media === "video" ? "video" : "audio";
  const statusLabel = missed
    ? call.status === "declined" ? "Declined" : call.status === "cancelled" ? "Cancelled" : "Missed"
    : duration || "Ended";

  return (
    <div className="flex items-center gap-4 rounded-[22px] bg-white/85 backdrop-blur-sm px-4 py-4 shadow-sm border border-white/60 hover:shadow-md transition-all duration-200">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${missed ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
        {isOutgoing ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[15px] font-semibold truncate ${missed ? "text-red-600" : "text-gray-900"}`}>{otherLabel}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${media === "video" ? "bg-blue-50 text-blue-500" : "bg-gray-100 text-gray-500"}`}>
            {media === "video" ? <Video className="h-2.5 w-2.5" /> : <Phone className="h-2.5 w-2.5" />}
            {media}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{isOutgoing ? "Outgoing" : "Incoming"}</span>
          <span>·</span>
          <span className="tabular-nums">{formatCallTime(call.offeredAt)}</span>
          {duration && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" /><span className="tabular-nums">{duration}</span></span>
            </>
          )}
        </div>
      </div>
      <div className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${missed ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
        {missed && <PhoneOff className="h-3 w-3" />}
        {statusLabel}
      </div>
    </div>
  );
}

function CallList({ calls, labelsVersion, isMissedTab }: { calls: EnrichedCall[]; labelsVersion: number; isMissedTab?: boolean }) {
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-pink-50 flex items-center justify-center mb-3">
          {isMissedTab ? <PhoneOff className="h-7 w-7 text-pink-200" /> : <Phone className="h-7 w-7 text-pink-200" />}
        </div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">{isMissedTab ? "No missed calls" : "No calls yet"}</h3>
        <p className="text-xs text-gray-400">{isMissedTab ? "You're all caught up!" : "Your call history will appear here."}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {calls.map(({ call, isOutgoing, otherLabel, missed }) => (
        <CallCard key={call.id} call={call} isOutgoing={isOutgoing} otherLabel={otherLabel} missed={missed} labelsVersion={labelsVersion} />
      ))}
    </div>
  );
}

export default function CallsPage() {
  const me = useAuthStore((s) => s.user);
  const [labelsVersion, setLabelsVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<"all" | "missed">("all");

  const { guaranteedData, error, isLoading } = usePrefetchedQuery({
    queryKey: ["calls"],
    queryFn: () => apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
    retry: false,
  });

  const calls = guaranteedData?.calls ?? EMPTY_CALLS;

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
    void resolveUserLabels(allUserIds).then(() => setLabelsVersion((x) => x + 1)).catch(() => {});
  }, [allUserIds]);

  const enrichedCalls: EnrichedCall[] = useMemo(() => calls.map((call) => {
    const isOutgoing = Boolean(me?.id) && call.callerId === me?.id;
    const otherId = isOutgoing ? call.calleeId : call.callerId;
    const otherLabel = getCachedUserLabel(otherId) ?? otherId;
    const missed = call.status === "missed" || call.status === "declined" || call.status === "cancelled" || !call.answeredAt;
    return { call, isOutgoing, otherLabel, missed };
  }), [calls, me?.id, labelsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const missedCalls = enrichedCalls.filter((c) => c.missed);

  return (
    <div className="flex flex-col h-full bg-[#fbfbfe]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-[#fbfbfe]/80 backdrop-blur-xl px-5 pt-8 pb-0 border-b border-black/5">
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight mb-4">Calls</h1>

        {!error && (
          <div className="flex gap-1 rounded-2xl bg-black/5 p-1 mb-0">
            {(["all", "missed"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-all ${
                  activeTab === tab
                    ? tab === "missed"
                      ? "bg-white text-red-500 shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                {tab === "all" ? `All (${enrichedCalls.length})` : `Missed${missedCalls.length > 0 ? ` (${missedCalls.length})` : ""}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="h-6 w-6 rounded-full border-2 border-(--accent-primary) border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-20 w-20 rounded-full bg-pink-50 flex items-center justify-center mb-4">
              <Phone className="h-9 w-9 text-pink-200" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Call history coming soon</h3>
            <p className="text-sm text-gray-500 max-w-[220px] mb-6">Your recent voice and video calls will appear here.</p>
            <Link href="/app" className="inline-flex items-center gap-2 rounded-full bg-(--accent-primary) px-6 py-3 text-sm font-bold text-white shadow-md hover:scale-105 active:scale-95 transition-all">
              <MessageCircle className="h-4 w-4" /> Go to messages
            </Link>
          </div>
        ) : (
          <CallList
            calls={activeTab === "missed" ? missedCalls : enrichedCalls}
            labelsVersion={labelsVersion}
            isMissedTab={activeTab === "missed"}
          />
        )}
      </div>

      <span className="sr-only">{labelsVersion}</span>
    </div>
  );
}
