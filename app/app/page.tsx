"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { ChevronRight, MessageSquarePlus, MessageCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";
import { formatLastSeen } from "@/lib/time";
import { usePrefetchedQuery } from "@/hooks/usePrefetchedQuery";

type Chat = {
  id: string;
  type: "dm";
  members: ChatMember[];
  lastMessage?: {
    id: string;
    type: "text" | "share" | "event";
    text: string | null;
    itemKind: "file" | "image" | "video" | "audio" | null;
    eventKind: "call_started" | "call_ended" | null;
    eventMedia: "audio" | "video" | null;
    from: string;
    createdAt: string;
  } | null;
  updatedAt: string;
};

type ChatMember = string | { id: string; email?: string; username?: string };

function memberId(member: ChatMember) {
  return typeof member === "string" ? member : member.id;
}

function memberName(member: ChatMember | null | undefined) {
  if (!member || typeof member === "string") return "Chat";
  return member.username?.trim() || member.email?.trim() || "Chat";
}

function formatChatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatLastMessagePreview(
  m: Chat["lastMessage"],
  meId?: string | null,
) {
  if (!m) return "No messages yet";
  const prefix = meId && m.from === meId ? "You: " : "";
  if (m.type === "event") {
    const media = m.eventMedia === "video" ? "video" : "audio";
    const label =
      m.eventKind === "call_started" ? "Call started" : "Call ended";
    return `${prefix}${label} (${media})`;
  }
  if (m.type === "share") {
    const kind = m.itemKind ?? "file";
    const label =
      kind === "image"
        ? "photo"
        : kind === "video"
          ? "video"
          : kind === "audio"
            ? "voice note"
            : "file";
    return `${prefix}Sent a ${label}`;
  }
  const t = (m.text ?? "").trim();
  return prefix + (t || "â€¦");
}

export default function ChatsPage() {
  const me = useAuthStore((s) => s.user);
  const typingByChatId = useTypingStore((s) => s.byChatId);
  const { guaranteedData, isInstantlyAvailable, error, isLoading } =
    usePrefetchedQuery({
      queryKey: ["chats"],
      queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
    });

  const chats = useMemo(() => guaranteedData?.chats ?? [], [guaranteedData]);
  const otherMembers = useMemo(
    () =>
      chats
        .map(
          (chat) =>
            chat.members.find((member) => memberId(member) !== me?.id) ?? null,
        )
        .filter(Boolean) as NonNullable<Chat["members"][number]>[],
    [chats, me?.id],
  );
  // Track online users via socket.io instead of REST polling (per FRONTEND_INTEGRATION.md)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    // Get initial online users list
    s.emit("presence:list", (response: { ok: boolean; users: string[] }) => {
      if (response.ok) {
        setOnlineUsers(new Set(response.users));
      }
    });

    // Listen for presence updates (when users come online/go offline)
    const handlePresenceUpdate = (data: { ok: boolean; users: string[] }) => {
      if (data.ok) {
        setOnlineUsers(new Set(data.users));
      }
    };

    // Initial online list on connect
    const handlePresenceOnline = (data: { ok: boolean; users: string[] }) => {
      if (data.ok) {
        setOnlineUsers(new Set(data.users));
      }
    };

    s.on("presence:update", handlePresenceUpdate);
    s.on("presence:online", handlePresenceOnline);

    return () => {
      s.off("presence:update", handlePresenceUpdate);
      s.off("presence:online", handlePresenceOnline);
    };
  }, []);

  // Create presence map for easy access - just track online status, lastSeen can be cached
  const presenceByUserId = useMemo(() => {
    const map = new Map<
      string,
      { isOnline: boolean; lastSeenAt: string | null }
    >();
    otherMembers.forEach((memberId) => {
      const userId = typeof memberId === "string" ? memberId : memberId.id;
      map.set(userId, {
        isOnline: onlineUsers.has(userId),
        lastSeenAt: lastSeen.get(userId) || null,
      });
    });
    return map;
  }, [otherMembers, onlineUsers, lastSeen]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
          Chats
        </h1>
        <Link
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
          href="/app/friends"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New message
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-black/60">Loading…</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-700">
          Could not load chats.
        </div>
      ) : chats.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-white/60 p-6 text-sm text-black/70">
          No chats yet. Add a friend and start a conversation.
        </div>
      ) : (
        <div className="mt-6 grid gap-2">
          {chats.map((c) => {
            const otherMember =
              c.members.find((m) => memberId(m) !== me?.id) ?? null;
            const presence = otherMember
              ? presenceByUserId.get(memberId(otherMember))
              : null;
            const name = memberName(otherMember);

            return (
              <Link
                key={c.id}
                href={`/app/chat/${c.id}`}
                className="focus-ring flex items-center justify-between rounded-3xl bg-white/70 px-4 py-4 shadow-sm hover:bg-white hover:shadow-md hover:scale-[1.02] transition-all duration-200"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="relative shrink-0">
                    <ChatAvatar name={name} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${
                        presence?.isOnline ? "bg-green-500" : "bg-slate-400"
                      }`}
                      title={
                        presence?.isOnline ? "Online now" : "Last seen recently"
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="truncate text-base font-semibold text-gray-800">
                        {name}
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {presence?.isOnline
                          ? "Online now"
                          : presence?.lastSeenAt
                            ? formatLastSeen(presence.lastSeenAt)
                            : "Offline"}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center justify-between gap-4 text-sm text-gray-500">
                      {(() => {
                        const t = typingByChatId[c.id];
                        const active = t && Date.now() - t.at < 6500;
                        const otherTyping =
                          active && t?.from && t.from !== me?.id;
                        if (otherTyping) {
                          return (
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <div className="inline-flex min-w-0 items-center gap-2 truncate font-semibold text-[color:var(--rose-700)]">
                                Typing
                                <span
                                  className="typing-dots"
                                  aria-hidden="true"
                                >
                                  <span />
                                  <span />
                                  <span />
                                </span>
                              </div>
                              <div className="shrink-0 tabular-nums text-black/35" />
                            </div>
                          );
                        }
                        return (
                          <>
                            <div className="min-w-0 truncate">
                              {formatLastMessagePreview(
                                c.lastMessage ?? null,
                                me?.id,
                              )}
                            </div>
                            <div className="shrink-0 tabular-nums">
                              {formatChatTime(
                                (c.lastMessage?.createdAt as
                                  | string
                                  | undefined) ?? c.updatedAt,
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-black/40" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatAvatar({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,229,238,0.88))] text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--rose-700)] shadow-sm">
      {initials}
    </div>
  );
}
