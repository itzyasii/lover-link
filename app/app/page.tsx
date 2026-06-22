"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { MessageSquarePlus } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";
import { formatLastSeen } from "@/lib/time";
import { usePrefetchedQuery } from "@/hooks/usePrefetchedQuery";
import { useChatsStore, Chat } from "@/stores/chats";
import { ChatListItem } from "@/components/chat/ChatListItem";

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
  return prefix + (t || "...");
}

export default function ChatsPage() {
  const me = useAuthStore((s) => s.user);
  const typingByChatId = useTypingStore((s) => s.byChatId);
  const { guaranteedData, error, isLoading } =
    usePrefetchedQuery({
      queryKey: ["chats"],
      queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
    });

  const setChats = useChatsStore((s) => s.setChats);
  const chatsStore = useChatsStore((s) => s.chats);
  const unreadCounts = useChatsStore((s) => s.unreadCounts);
  const togglePinStore = useChatsStore((s) => s.togglePin);
  const toggleMuteStore = useChatsStore((s) => s.toggleMute);

  useEffect(() => {
    if (guaranteedData?.chats) {
      setChats(guaranteedData.chats);
    }
  }, [guaranteedData, setChats]);

  const chats = useMemo(() => {
    const arr = [...chatsStore];
    return arr.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = new Date(a.lastMessage?.createdAt || a.updatedAt).getTime();
      const timeB = new Date(b.lastMessage?.createdAt || b.updatedAt).getTime();
      return timeB - timeA;
    });
  }, [chatsStore]);

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

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [lastSeen, setLastSeen] = useState<Map<string, string>>(new Map());
  const queryClient = useQueryClient(); 

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    s.emit(
      "presence:list",
      (response: {
        ok: boolean;
        users: string[];
        lastSeen?: Record<string, string>;
      }) => {
        if (response.ok) {
          setOnlineUsers(new Set(response.users));
          if (response.lastSeen) {
            setLastSeen(new Map(Object.entries(response.lastSeen)));
          }
        }
      },
    );

    const handlePresenceUpdate = (data: {
      ok: boolean;
      users: string[];
      lastSeen?: Record<string, string>;
    }) => {
      if (data.ok) {
        setOnlineUsers(new Set(data.users));
        if (data.lastSeen) {
          setLastSeen(new Map(Object.entries(data.lastSeen)));
        }
      }
    };

    const handleNewMessage = (data: { ok: boolean; chatId: string }) => {
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      }
    };

    s.on("presence:update", handlePresenceUpdate);
    s.on("presence:online", handlePresenceUpdate);
    s.on("chat:message", handleNewMessage);
    s.on("share:item", handleNewMessage);

    return () => {
      s.off("presence:update", handlePresenceUpdate);
      s.off("presence:online", handlePresenceUpdate);
      s.off("chat:message", handleNewMessage);
      s.off("share:item", handleNewMessage);
    };
  }, [queryClient]);

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

  const handlePin = async (chatId: string, isPinned: boolean) => {
    togglePinStore(chatId);
    try {
      if (isPinned) {
        await apiFetch(`/api/chats/${chatId}/pin`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/chats/${chatId}/pin`, { method: "POST" });
      }
    } catch {
      togglePinStore(chatId); 
    }
  };

  const handleMute = async (chatId: string, isMuted: boolean) => {
    toggleMuteStore(chatId);
    try {
      if (isMuted) {
        await apiFetch(`/api/chats/${chatId}/mute`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/chats/${chatId}/mute`, { method: "POST" });
      }
    } catch {
      toggleMuteStore(chatId); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#fbfbfe]">
      {/* Header Sticky Area */}
      <div className="sticky top-0 z-30 bg-[#fbfbfe]/80 backdrop-blur-xl px-5 pt-8 pb-4 border-b border-black/5 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">
          Chats
        </h1>
        <Link
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full bg-(--accent-primary) text-white shadow-lg shadow-(--accent-glow) hover:scale-105 active:scale-95 transition-all duration-300"
          href="/app/friends"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="h-6 w-6 rounded-full border-2 border-(--accent-primary) border-t-transparent animate-spin"></div>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100">
            Could not load chats.
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 mt-10">
            <div className="h-24 w-24 rounded-full bg-pink-50 flex items-center justify-center mb-4">
              <MessageSquarePlus className="h-10 w-10 text-pink-200" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
            <p className="text-sm text-gray-500 max-w-[200px]">Start a conversation with a friend to see it here.</p>
          </div>
        ) : (
          chats.map((c) => {
            const otherMember =
              c.members.find((m) => memberId(m) !== me?.id) ?? null;
            const presence = otherMember
              ? presenceByUserId.get(memberId(otherMember))
              : null;
            const name = memberName(otherMember);

            const t = typingByChatId[c.id];
            const active = t && Date.now() - t.at < 6500;
            const isTyping = Boolean(active && t?.from && t.from !== me?.id);

            return (
              <ChatListItem
                key={c.id}
                chat={c}
                name={name}
                presence={presence}
                otherMemberId={otherMember ? memberId(otherMember) : null}
                meId={me?.id}
                unreadCount={unreadCounts[c.id] || 0}
                isTyping={isTyping}
                previewText={formatLastMessagePreview(c.lastMessage ?? null, me?.id)}
                timeText={formatChatTime(
                  (c.lastMessage?.createdAt as string | undefined) ?? c.updatedAt
                )}
                onPin={(isPinned) => handlePin(c.id, isPinned)}
                onMute={(isMuted) => handleMute(c.id, isMuted)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
