"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { useAuthStore } from "@/stores/auth";

type Chat = {
  id: string;
  type: "dm";
  members: { id: string; email?: string; username?: string }[];
  updatedAt: string;
};

export default function ChatsPage() {
  const me = useAuthStore((s) => s.user);
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
              <div>
                <div className="text-sm font-semibold text-[color:var(--wine-900)]">
                  {c.members?.find((m) => m.id !== me?.id)?.username ??
                    c.members?.find((m) => m.id !== me?.id)?.email ??
                    "Chat"}
                </div>
                <div className="text-xs text-black/55">
                  Updated {new Date(c.updatedAt).toLocaleString()}
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
