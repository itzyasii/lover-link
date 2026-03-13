"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type User = { id: string; email: string; username: string };

export default function FriendsPage() {
  const me = useAuthStore((s) => s.user);
  const [q, setQ] = useState("");

  const friendsQ = useQuery({
    queryKey: ["friends"],
    queryFn: () => apiFetch<{ ok: true; friends: User[] }>("/api/users/friends"),
  });

  const reqQ = useQuery({
    queryKey: ["friendRequests"],
    queryFn: () =>
      apiFetch<{ ok: true; incoming: User[]; outgoing: User[] }>(
        "/api/users/friends/requests",
      ),
  });

  const searchQ = useQuery({
    queryKey: ["userSearch", q],
    enabled: q.trim().length >= 2,
    queryFn: () =>
      apiFetch<{ ok: true; users: User[] }>(
        `/api/users/search?q=${encodeURIComponent(q)}`,
      ),
  });

  const users = useMemo(() => searchQ.data?.users ?? [], [searchQ.data]);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
        Friends
      </h1>
      <p className="mt-1 text-sm text-black/60">
        Find someone special and start a DM.
      </p>

      <div className="mt-6 grid gap-3">
        <input
          className="focus-ring rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm"
          placeholder="Search by username or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {q.trim().length >= 2 ? (
          <div className="rounded-3xl bg-white/55 p-4">
            <div className="text-xs font-semibold text-black/60">Results</div>
            <div className="mt-3 grid gap-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FriendAvatar user={u} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
                        {u.username}
                      </div>
                      <div className="truncate text-xs text-black/55">{u.email}</div>
                    </div>
                  </div>
                  {u.id === me?.id ? (
                    <span className="text-xs text-black/40">You</span>
                  ) : (
                    <button
                      className="focus-ring rounded-xl bg-[color:var(--rose-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--rose-700)]"
                      onClick={async () => {
                        await apiFetch("/api/users/friends/request", {
                          method: "POST",
                          body: JSON.stringify({ toUserId: u.id }),
                        });
                        void reqQ.refetch();
                      }}
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
              {users.length === 0 ? (
                <div className="text-sm text-black/50">No results.</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Section title="Incoming requests">
          {(reqQ.data?.incoming ?? []).map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={u} />
                <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
                  {u.username}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="focus-ring rounded-xl bg-[color:var(--rose-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--rose-700)]"
                  onClick={async () => {
                    await apiFetch("/api/users/friends/accept", {
                      method: "POST",
                      body: JSON.stringify({ fromUserId: u.id }),
                    });
                    void friendsQ.refetch();
                    void reqQ.refetch();
                  }}
                >
                  Accept
                </button>
                <button
                  className="focus-ring rounded-xl bg-black/5 px-3 py-2 text-xs font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                  onClick={async () => {
                    await apiFetch("/api/users/friends/reject", {
                      method: "POST",
                      body: JSON.stringify({ fromUserId: u.id }),
                    });
                    void reqQ.refetch();
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {(reqQ.data?.incoming ?? []).length === 0 ? (
            <div className="text-sm text-black/50">No incoming requests.</div>
          ) : null}
        </Section>

        <Section title="Your friends">
          {(friendsQ.data?.friends ?? []).map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={u} />
                <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
                  {u.username}
                </div>
              </div>
              <button
                className="focus-ring rounded-xl bg-black/5 px-3 py-2 text-xs font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                onClick={async () => {
                  const r = await apiFetch<{ ok: true; chat: { id: string } }>(
                    "/api/chats/dm",
                    {
                      method: "POST",
                      body: JSON.stringify({ userId: u.id }),
                    },
                  );
                  window.location.href = `/app/chat/${r.chat.id}`;
                }}
              >
                Message
              </button>
            </div>
          ))}
          {(friendsQ.data?.friends ?? []).length === 0 ? (
            <div className="text-sm text-black/50">No friends yet.</div>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white/55 p-4">
      <div className="text-xs font-semibold text-black/60">{title}</div>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function FriendAvatar({ user }: { user: User }) {
  const label = (user.username || user.email || "?").trim();
  const initials = label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,229,238,0.88))] text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--rose-700)] shadow-sm">
      {initials}
    </div>
  );
}
