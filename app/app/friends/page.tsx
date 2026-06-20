"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  MessageCircle,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type User = {
  id: string;
  email?: string;
  username: string;
  avatarUrl?: string;
  online?: boolean;
};

type FriendRequestsResponse = {
  ok: true;
  sent?: User[];
  received?: User[];
  incoming?: User[];
  outgoing?: User[];
};

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
      apiFetch<FriendRequestsResponse>("/api/users/friends/requests"),
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
  const incoming = reqQ.data?.received ?? reqQ.data?.incoming ?? [];
  const outgoing = reqQ.data?.sent ?? reqQ.data?.outgoing ?? [];

  const refetchPeople = () => {
    void friendsQ.refetch();
    void reqQ.refetch();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--wine-900)]">
            Friends
          </h1>
          <p className="mt-1 text-sm text-black/55">
            Find people, accept requests, and open a chat.
          </p>
        </div>
        {outgoing.length ? (
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-black/55">
            {outgoing.length} sent
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 rounded-2xl border border-black/5 bg-white/70 p-3 shadow-sm">
        <label className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-black/40" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/35"
            placeholder="Search username"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        {q.trim().length >= 2 ? (
          <div>
            <div className="px-1 text-xs font-semibold text-black/50">
              Results
            </div>
            <div className="mt-3 grid gap-2">
              {users.map((u) => (
                <PersonRow
                  key={u.id}
                  user={u}
                  aside={
                    u.id === me?.id ? (
                      <span className="text-xs text-black/40">You</span>
                    ) : (
                      <button
                        className="focus-ring inline-flex items-center gap-2 rounded-xl bg-[color:var(--rose-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--rose-700)]"
                        onClick={async () => {
                          await apiFetch("/api/users/friends/request", {
                            method: "POST",
                            body: JSON.stringify({ toUserId: u.id }),
                          });
                          void reqQ.refetch();
                        }}
                        type="button"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Add
                      </button>
                    )
                  }
                />
              ))}
              {users.length === 0 ? (
                <div className="rounded-2xl bg-white/60 px-3 py-4 text-sm text-black/50">
                  No results.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Requests">
          {incoming.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              aside={
                <div className="flex items-center gap-2">
                  <button
                    className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--rose-600)] text-white hover:bg-[color:var(--rose-700)]"
                    onClick={async () => {
                      await apiFetch("/api/users/friends/accept", {
                        method: "POST",
                        body: JSON.stringify({ fromUserId: u.id }),
                      });
                      refetchPeople();
                    }}
                    title="Accept"
                    type="button"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
                    onClick={async () => {
                      await apiFetch("/api/users/friends/reject", {
                        method: "POST",
                        body: JSON.stringify({ fromUserId: u.id }),
                      });
                      void reqQ.refetch();
                    }}
                    title="Reject"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              }
            />
          ))}
          {incoming.length === 0 ? <EmptyText>No requests right now.</EmptyText> : null}
        </Section>

        <Section title="Your Friends">
          {(friendsQ.data?.friends ?? []).map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              showStatus
              aside={
                <div className="flex items-center gap-2">
                  <button
                    className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
                    onClick={async () => {
                      await apiFetch("/api/users/friends/unfriend", {
                        method: "POST",
                        body: JSON.stringify({ userId: u.id }),
                      });
                      void friendsQ.refetch();
                    }}
                    title="Remove friend"
                    type="button"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                  <button
                    className="focus-ring inline-flex items-center gap-2 rounded-xl bg-[color:var(--rose-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--rose-700)]"
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
                    type="button"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Chat
                  </button>
                </div>
              }
            />
          ))}
          {(friendsQ.data?.friends ?? []).length === 0 ? (
            <EmptyText>No friends yet.</EmptyText>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/60 p-3 shadow-sm">
      <div className="px-1 text-xs font-semibold text-black/50">{title}</div>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/60 px-3 py-4 text-sm text-black/50">
      {children}
    </div>
  );
}

function PersonRow({
  user,
  aside,
  showStatus,
}: {
  user: User;
  aside: React.ReactNode;
  showStatus?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FriendAvatar user={user} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
            {user.username || user.email || "Friend"}
          </div>
          {showStatus ? (
            <div className="flex items-center gap-1.5 text-xs text-black/45">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  user.online ? "bg-emerald-500" : "bg-black/25"
                }`}
              />
              {user.online ? "Online" : "Offline"}
            </div>
          ) : user.email ? (
            <div className="truncate text-xs text-black/45">{user.email}</div>
          ) : null}
        </div>
      </div>
      {aside}
    </div>
  );
}

function FriendAvatar({ user }: { user: User }) {
  const label = (user.username || user.email || "?").trim();
  const initials =
    label
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-black/5 bg-[color:var(--peach-200)]/55 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--rose-700)]">
      {initials}
    </div>
  );
}
