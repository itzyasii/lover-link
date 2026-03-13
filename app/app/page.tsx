"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";

type Chat = {
  id: string;
  type: "dm";
  members: { id: string; email?: string; username?: string }[];
  lastMessage?:
    | {
        id: string;
        type: "text" | "share" | "event";
        text: string | null;
        itemKind: "file" | "image" | "video" | "audio" | null;
        eventKind: "call_started" | "call_ended" | null;
        eventMedia: "audio" | "video" | null;
        from: string;
        createdAt: string;
      }
    | null;
  updatedAt: string;
};

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
    const label = m.eventKind === "call_started" ? "Call started" : "Call ended";
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["chats"],
    queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
  });

  const chats = data?.chats ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[color:var(--wine-900)]">
          Chats
        </h1>
        <Link
          className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
          href="/app/friends"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
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
          {chats.map((c) => (
            <Link
              key={c.id}
              href={`/app/chat/${c.id}`}
              className="focus-ring flex items-center justify-between rounded-2xl bg-white/55 px-4 py-4 hover:bg-white/70"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/avatars/default-love.svg"
                  alt=""
                  className="h-11 w-11 rounded-2xl bg-white/70 p-1 shadow-sm"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
                    {c.members?.find((m) => m.id !== me?.id)?.username ??
                      c.members?.find((m) => m.id !== me?.id)?.email ??
                      "Chat"}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center justify-between gap-3 text-xs text-black/55">
                    {(() => {
                      const t = typingByChatId[c.id];
                      const active = t && Date.now() - t.at < 6500;
                      const otherTyping = active && t?.from && t.from !== me?.id;
                      if (otherTyping) {
                        return (
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="inline-flex min-w-0 items-center gap-2 truncate font-semibold text-[color:var(--rose-700)]">
                              Typing
                              <span className="typing-dots" aria-hidden="true">
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
                            {formatLastMessagePreview(c.lastMessage ?? null, me?.id)}
                          </div>
                          <div className="shrink-0 tabular-nums">
                            {formatChatTime(
                              (c.lastMessage?.createdAt as string | undefined) ??
                                c.updatedAt,
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
          ))}
        </div>
      )}
    </div>
  );
}
