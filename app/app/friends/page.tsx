"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircle, Search, UserMinus, UserPlus, X, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { usePrefetchedQuery } from "@/hooks/usePrefetchedQuery";

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
  const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends");

  const friendsQ = usePrefetchedQuery({
    queryKey: ["friends"],
    queryFn: () => apiFetch<{ ok: true; friends: User[] }>("/api/users/friends"),
  });

  const reqQ = usePrefetchedQuery({
    queryKey: ["friendRequests"],
    queryFn: () => apiFetch<FriendRequestsResponse>("/api/users/friends/requests"),
  });

  const searchQ = useQuery({
    queryKey: ["userSearch", q],
    enabled: q.trim().length >= 2,
    queryFn: () => apiFetch<{ ok: true; users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  });

  const users = useMemo(() => searchQ.data?.users ?? [], [searchQ.data]);
  const incoming = reqQ.data?.received ?? reqQ.data?.incoming ?? [];
  const outgoing = reqQ.data?.sent ?? reqQ.data?.outgoing ?? [];
  const friends = friendsQ.data?.friends ?? [];

  const refetchPeople = () => { void friendsQ.refetch(); void reqQ.refetch(); };

  return (
    <div className="flex flex-col h-full bg-[#fbfbfe]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-[#fbfbfe]/80 backdrop-blur-xl px-5 pt-8 pb-4 border-b border-black/5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Friends</h1>
          {incoming.length > 0 && (
            <button
              onClick={() => setActiveTab("requests")}
              className="flex items-center gap-1.5 rounded-full bg-(--accent-primary) px-3 py-1.5 text-xs font-bold text-white shadow-md"
            >
              {incoming.length} request{incoming.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>

        {/* Search Bar */}
        <label className="flex items-center gap-3 rounded-2xl bg-white border border-black/8 px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-(--accent-glow) focus-within:border-(--accent-primary) transition-all">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none"
            placeholder="Search by username..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button onClick={() => setQ("")} className="shrink-0 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Search results */}
        {q.trim().length >= 2 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Search results</p>
            {searchQ.isLoading ? (
              <div className="flex justify-center p-6">
                <div className="h-6 w-6 rounded-full border-2 border-(--accent-primary) border-t-transparent animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl bg-white/70 p-6 text-center text-sm text-gray-500 border border-black/5">
                No users found for &ldquo;{q}&rdquo;
              </div>
            ) : (
              users.map((u) => (
                <PersonCard key={u.id} user={u}>
                  {u.id === me?.id ? (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">You</span>
                  ) : (
                    <button
                      className="focus-ring flex items-center gap-1.5 rounded-full bg-(--accent-primary) px-4 py-2 text-xs font-bold text-white shadow-sm hover:scale-105 active:scale-95 transition-all"
                      onClick={async () => {
                        await apiFetch("/api/users/friends/request", { method: "POST", body: JSON.stringify({ toUserId: u.id }) });
                        void reqQ.refetch();
                      }}
                      type="button"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </button>
                  )}
                </PersonCard>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-5 rounded-2xl bg-black/5 p-1">
              {(["friends", "requests"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition-all capitalize ${
                    activeTab === tab
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "requests" && incoming.length > 0 ? `Requests (${incoming.length})` : tab === "friends" ? `Friends (${friends.length})` : tab}
                </button>
              ))}
            </div>

            {activeTab === "friends" && (
              <div className="space-y-2">
                {friendsQ.isLoading ? (
                  <div className="flex justify-center p-6">
                    <div className="h-6 w-6 rounded-full border-2 border-(--accent-primary) border-t-transparent animate-spin" />
                  </div>
                ) : friends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-20 w-20 rounded-full bg-pink-50 flex items-center justify-center mb-4">
                      <Users className="h-9 w-9 text-pink-200" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-800 mb-1">No friends yet</h3>
                    <p className="text-sm text-gray-500">Search above to find people to connect with.</p>
                  </div>
                ) : (
                  friends.map((u) => (
                    <PersonCard key={u.id} user={u} showStatus>
                      <div className="flex items-center gap-2">
                        <button
                          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors active:scale-95"
                          onClick={async () => { await apiFetch("/api/users/friends/unfriend", { method: "POST", body: JSON.stringify({ userId: u.id }) }); void friendsQ.refetch(); }}
                          title="Remove friend"
                          type="button"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                        <button
                          className="focus-ring flex items-center gap-1.5 rounded-full bg-(--accent-primary) px-4 py-2 text-xs font-bold text-white shadow-sm hover:scale-105 active:scale-95 transition-all"
                          onClick={async () => {
                            const r = await apiFetch<{ ok: true; chat: { id: string } }>("/api/chats/dm", { method: "POST", body: JSON.stringify({ userId: u.id }) });
                            window.location.href = `/app/chat/${r.chat.id}`;
                          }}
                          type="button"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Message
                        </button>
                      </div>
                    </PersonCard>
                  ))
                )}
              </div>
            )}

            {activeTab === "requests" && (
              <div className="space-y-4">
                {incoming.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Incoming</p>
                    <div className="space-y-2">
                      {incoming.map((u) => (
                        <PersonCard key={u.id} user={u}>
                          <div className="flex items-center gap-2">
                            <button
                              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-(--accent-primary) text-white shadow-sm hover:scale-105 active:scale-95 transition-all"
                              onClick={async () => { await apiFetch("/api/users/friends/accept", { method: "POST", body: JSON.stringify({ fromUserId: u.id }) }); refetchPeople(); }}
                              title="Accept"
                              type="button"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-gray-600 hover:bg-red-50 hover:text-red-500 transition-colors active:scale-95"
                              onClick={async () => { await apiFetch("/api/users/friends/reject", { method: "POST", body: JSON.stringify({ fromUserId: u.id }) }); void reqQ.refetch(); }}
                              title="Reject"
                              type="button"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </PersonCard>
                      ))}
                    </div>
                  </div>
                )}
                {outgoing.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">Sent</p>
                    <div className="space-y-2">
                      {outgoing.map((u) => (
                        <PersonCard key={u.id} user={u}>
                          <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">Pending</span>
                        </PersonCard>
                      ))}
                    </div>
                  </div>
                )}
                {incoming.length === 0 && outgoing.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-20 w-20 rounded-full bg-pink-50 flex items-center justify-center mb-4">
                      <Check className="h-9 w-9 text-pink-200" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-800 mb-1">No pending requests</h3>
                    <p className="text-sm text-gray-500">You&apos;re all caught up!</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PersonCard({ user, children, showStatus }: { user: User; children: React.ReactNode; showStatus?: boolean }) {
  const label = (user.username || user.email || "?").trim();
  const initials = label.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] bg-white/85 backdrop-blur-sm px-4 py-3.5 shadow-sm border border-white/60 hover:shadow-md transition-shadow">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative shrink-0">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 text-sm font-bold uppercase tracking-wider text-(--accent-primary) border-2 border-white shadow-sm">
            {initials}
          </div>
          {showStatus && (
            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${user.online ? "bg-green-500" : "bg-gray-300"}`} />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-gray-900">{user.username || user.email || "Friend"}</div>
          {showStatus ? (
            <div className="text-xs font-medium text-gray-400">{user.online ? "Online now" : "Offline"}</div>
          ) : user.email ? (
            <div className="truncate text-xs text-gray-400">{user.email}</div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
