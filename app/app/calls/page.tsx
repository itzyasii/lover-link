"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

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

export default function CallsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["calls"],
    queryFn: () => apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
  });

  return (
    <div>
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
        Calls
      </h1>
      <p className="mt-1 text-sm text-black/60">History and missed notifications.</p>

      {isLoading ? (
        <div className="mt-6 text-sm text-black/60">Loading…</div>
      ) : (
        <div className="mt-6 grid gap-2">
          {(data?.calls ?? []).map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/60 px-4 py-3 text-sm">
              <div className="font-semibold text-[color:var(--wine-900)]">
                {c.status.toUpperCase()} {c.reason ? `(${c.reason})` : ""}
              </div>
              <div className="text-xs text-black/55">
                {new Date(c.offeredAt).toLocaleString()}
              </div>
            </div>
          ))}
          {(data?.calls ?? []).length === 0 ? (
            <div className="text-sm text-black/50">No calls yet.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

