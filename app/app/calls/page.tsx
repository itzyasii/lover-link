"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Clock, PhoneOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getCachedUserLabel, resolveUserLabels } from "@/lib/users";
import { useAuthStore } from "@/stores/auth";

type Call = {
  id: string;
  callId: string;
  callerId: string;
  calleeId: string;
  status: string;
  offeredAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  reason: string | null;
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

function safeMs(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const d = y - x;
  if (d < 0) return null;
  return d;
}

export default function CallsPage() {
  const me = useAuthStore((s) => s.user);
  const [labelsVersion, setLabelsVersion] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["calls"],
    queryFn: () => apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
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
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">Calls</h1>
          <p className="mt-1 text-sm text-black/60">History, missed calls, and durations.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-black/60">Loading...</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {calls.map((c) => {
            const isOutgoing = Boolean(me?.id) && c.callerId === me?.id;
            const otherId = isOutgoing ? c.calleeId : c.callerId;
            const otherLabel = getCachedUserLabel(otherId) ?? otherId;
            const durMs = safeMs(c.answeredAt, c.endedAt);
            const missed = !c.answeredAt;

            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-3xl bg-white/60 px-4 py-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-2xl ${
                      missed ? "bg-[color:var(--rose-600)]/10 text-[color:var(--rose-700)]" : "bg-black/5 text-black/65"
                    }`}
                    aria-hidden="true"
                  >
                    {isOutgoing ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                        {isOutgoing ? "Outgoing" : "Incoming"}{" "}
                        <span className="text-black/40">{isOutgoing ? "to" : "from"}</span>{" "}
                        {otherLabel}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          missed
                            ? "bg-[color:var(--rose-600)]/10 text-[color:var(--rose-800)]"
                            : "bg-black/5 text-black/70"
                        }`}
                        title={c.reason ?? c.status}
                      >
                        {(missed ? "MISSED" : c.status || "OK").toUpperCase()}
                        {c.reason ? ` (${c.reason})` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-black/55">
                      <span className="tabular-nums">{new Date(c.offeredAt).toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="tabular-nums">{durMs == null ? "—" : formatDuration(durMs)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {missed ? (
                  <div className="mt-1 inline-flex items-center gap-2 rounded-2xl bg-black/5 px-3 py-2 text-xs font-semibold text-black/65">
                    <PhoneOff className="h-4 w-4" /> Missed
                  </div>
                ) : null}
              </div>
            );
          })}

          {calls.length === 0 ? <div className="text-sm text-black/50">No calls yet.</div> : null}
        </div>
      )}

      {/* forces re-render when label cache fills */}
      <span className="sr-only">{labelsVersion}</span>
    </div>
  );
}
