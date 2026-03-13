"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, uploadFile } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";
import {
  Check,
  CheckCheck,
  Download,
  File as FileIcon,
  FileText,
  Paperclip,
  Pencil,
  Phone,
  Send,
  SmilePlus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/env";
import { useCall } from "@/components/call/CallProvider";
import { formatLastSeen } from "@/lib/time";
import {
  RomanticImageAttachment,
  RomanticVideoAttachment,
} from "@/components/chat/MediaAttachments";

type Chat = {
  id: string;
  type: "dm";
  members: { id: string; email?: string; username?: string }[];
};

type ShareItem = {
  kind?: "file" | "image" | "video" | "audio";
  url?: string;
  legacyUrl?: string;
  originalName?: string;
  mime?: string;
  size?: number;
  meta?: Record<string, unknown>;
} & Record<string, unknown>;

type ReactionUser = {
  id: string;
  username?: string;
  email?: string;
};

type Msg = {
  id: string;
  chatId: string;
  from: string;
  type: "text" | "share" | "event";
  text: string | null;
  item: ShareItem | null;
  event?: {
    kind: "call_started" | "call_ended";
    media: "audio" | "video";
    callId: string;
    by: string;
    durationMs?: number;
  } | null;
  receipts: { userId: string; deliveredAt?: string; readAt?: string }[];
  reactions?: {
    emoji: string;
    userId: string;
    createdAt: string;
    user?: ReactionUser;
  }[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

const QUICK_REACTIONS = [
  "\uD83D\uDC4D",
  "\u2764\uFE0F",
  "\uD83D\uDE02",
  "\uD83D\uDE2E",
  "\uD83D\uDE22",
  "\uD83D\uDE21",
  "\uD83D\uDC4E",
] as const;

type ReactionAck = {
  ok: boolean;
  action?: "added" | "removed";
  user?: ReactionUser;
};

type ReactionGroup = {
  emoji: string;
  count: number;
  me: boolean;
  userIds: string[];
  userLabels: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

function normalizeReactions(reactions: unknown): Msg["reactions"] {
  if (!Array.isArray(reactions)) return [];
  return reactions
    .map((reaction) => {
      const rec = asRecord(reaction);
      const emoji = typeof rec?.emoji === "string" ? rec.emoji : null;
      const userIdRaw = rec?.userId;
      const userId = userIdRaw == null ? null : String(userIdRaw);
      const createdAtRaw = rec?.createdAt;
      const createdAt =
        typeof createdAtRaw === "string"
          ? createdAtRaw
          : createdAtRaw instanceof Date
            ? createdAtRaw.toISOString()
            : createdAtRaw == null
              ? null
              : String(createdAtRaw);
      const userRec = asRecord(rec?.user);
      if (!emoji || !userId) return null;
      return {
        emoji,
        userId,
        createdAt: createdAt ?? new Date().toISOString(),
        user: {
          id: typeof userRec?.id === "string" ? userRec.id : userId,
          username:
            typeof userRec?.username === "string"
              ? userRec.username
              : undefined,
          email: typeof userRec?.email === "string" ? userRec.email : undefined,
        },
      };
    })
    .filter(Boolean) as Msg["reactions"];
}

function normalizeEvent(e: unknown): Msg["event"] {
  const r = asRecord(e);
  if (!r) return null;
  const kind =
    r.kind === "call_started" || r.kind === "call_ended" ? r.kind : null;
  const media = r.media === "audio" || r.media === "video" ? r.media : null;
  const callId = typeof r.callId === "string" ? r.callId : "";
  const by = r.by == null ? "" : String(r.by);
  const durationMs =
    typeof r.durationMs === "number" ? r.durationMs : undefined;
  if (!kind || !media || !callId || !by) return null;
  return { kind, media, callId, by, durationMs };
}

function applyReactionActionLocal(
  msg: Msg,
  userId: string,
  emoji: string,
  action: "added" | "removed",
  at: string,
  user?: ReactionUser,
): Msg {
  const reactions = msg.reactions ?? [];
  if (action === "added") {
    if (
      reactions.some(
        (reaction) => reaction.emoji === emoji && reaction.userId === userId,
      )
    ) {
      return {
        ...msg,
        reactions: reactions.map((reaction) =>
          reaction.emoji === emoji && reaction.userId === userId
            ? { ...reaction, user: reaction.user ?? user }
            : reaction,
        ),
      };
    }
    return {
      ...msg,
      reactions: [...reactions, { emoji, userId, createdAt: at, user }],
    };
  }
  return {
    ...msg,
    reactions: reactions.filter(
      (reaction) => !(reaction.emoji === emoji && reaction.userId === userId),
    ),
  };
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const me = useAuthStore((s) => s.user);
  const { startCall } = useCall();
  const [text, setText] = useState("");
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [openReactionFor, setOpenReactionFor] = useState<string | null>(null);
  const typingTimer = useRef<number | null>(null);
  const typingAckFailedOnce = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const ensureSocket = () => {
    const s = getSocket();
    if (!s.connected) s.connect();
    return s;
  };

  const emitTyping = (isTyping: boolean) => {
    const s = ensureSocket();
    s.emit("chat:typing", { chatId, isTyping }, (ack?: { ok: boolean }) => {
      if (ack?.ok) return;
      if (typingAckFailedOnce.current) return;
      typingAckFailedOnce.current = true;
      toast({
        title: "Typing unavailable",
        message:
          "Could not send typing indicator. Check connection or reopen the chat.",
        tone: "error",
      });
    });
  };

  const emitReaction = (messageId: string, emoji: string) => {
    if (!me?.id) return;
    setOpenReactionFor(null);

    const s = ensureSocket();

    const at = new Date().toISOString();

    // optimistic toggle
    setMessages((prev) =>
      prev.map((x) =>
        x.id === messageId
          ? toggleReactionLocal(x, me.id, emoji, {
              id: me.id,
              username: me.username,
              email: me.email,
            })
          : x,
      ),
    );

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      toast({
        title: "Reaction timed out",
        message: "No response from server. Check your socket connection.",
        tone: "error",
      });
      setMessages((prev) =>
        prev.map((x) =>
          x.id === messageId
            ? toggleReactionLocal(x, me.id, emoji, {
                id: me.id,
                username: me.username,
                email: me.email,
              })
            : x,
        ),
      );
    }, 2500);

    s.emit(
      "chat:react",
      { messageId, emoji },
      (ack: ReactionAck & { error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);

        if (!ack?.ok) {
          toast({
            title: "Reaction failed",
            message: ack?.error
              ? `Server rejected this reaction (${ack.error}).`
              : "Server rejected this reaction.",
            tone: "error",
          });
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? toggleReactionLocal(x, me.id, emoji, {
                    id: me.id,
                    username: me.username,
                    email: me.email,
                  })
                : x,
            ),
          );
          return;
        }

        if (ack.action) {
          setMessages((prev) =>
            prev.map((x) =>
              x.id === messageId
                ? applyReactionActionLocal(
                    x,
                    me.id,
                    emoji,
                    ack.action!,
                    at,
                    ack.user,
                  )
                : x,
            ),
          );
        }
      },
    );
  };

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
  });

  const chat = useMemo(
    () => chatsQuery.data?.chats.find((c) => c.id === chatId) ?? null,
    [chatsQuery.data, chatId],
  );

  const chatByIdQuery = useQuery({
    queryKey: ["chat", chatId],
    enabled: Boolean(chatId) && !chat,
    queryFn: () => apiFetch<{ ok: true; chat: Chat }>(`/api/chats/${chatId}`),
  });

  const resolvedChat = chatByIdQuery.data?.chat ?? chat;

  const otherUserId = useMemo(() => {
    if (!resolvedChat || !me) return null;
    const ids = resolvedChat.members.map((m) => m.id);
    return ids.find((id) => id !== me.id) ?? null;
  }, [resolvedChat, me]);

  const reactionUserDirectory = useMemo(() => {
    const users = new Map<string, ReactionUser>();
    for (const member of resolvedChat?.members ?? []) {
      users.set(member.id, {
        id: member.id,
        username: member.username,
        email: member.email,
      });
    }
    if (me?.id) {
      users.set(me.id, {
        id: me.id,
        username: me.username,
        email: me.email,
      });
    }
    return users;
  }, [resolvedChat, me]);

  const reactionUserLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const [id, user] of reactionUserDirectory) {
      labels.set(
        id,
        id === me?.id
          ? "You"
          : user.username?.trim() || user.email?.trim() || "Unknown",
      );
    }
    for (const message of messages) {
      for (const reaction of message.reactions ?? []) {
        const label =
          reaction.userId === me?.id
            ? "You"
            : reaction.user?.username?.trim() ||
              reaction.user?.email?.trim() ||
              labels.get(reaction.userId);
        if (label) labels.set(reaction.userId, label);
      }
    }
    if (me?.id && !labels.has(me.id)) labels.set(me.id, "You");
    return labels;
  }, [messages, reactionUserDirectory, me]);

  const presenceQ = useQuery({
    queryKey: ["presence", otherUserId],
    enabled: Boolean(otherUserId),
    queryFn: () =>
      apiFetch<{
        ok: true;
        presence: {
          userId: string;
          isOnline: boolean;
          lastSeenAt: string | null;
        }[];
      }>(`/api/users/presence?ids=${otherUserId}`),
    refetchInterval: 10_000,
  });

  const presence = presenceQ.data?.presence?.[0];
  const otherMember =
    resolvedChat?.members.find((member) => member.id !== me?.id) ?? null;
  const otherDisplayName =
    otherMember?.username?.trim() || otherMember?.email?.trim() || "Chat";
  const conversationStatus = typingFrom
    ? "Typing..."
    : presence?.isOnline
      ? "Online now"
      : presence?.lastSeenAt
        ? formatLastSeen(presence.lastSeenAt)
        : "Private conversation";

  useEffect(() => {
    if (!chatId) return;
    void apiFetch<{ ok: true; messages: Msg[]; nextCursor: string | null }>(
      `/api/chats/${chatId}/messages?limit=50`,
    )
      .then((r) =>
        setMessages(
          r.messages.map((m) => ({
            ...m,
            reactions: normalizeReactions(m.reactions),
            event: normalizeEvent(m.event),
          })),
        ),
      )
      .catch(() => setMessages([]));
  }, [chatId]);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();
    typingAckFailedOnce.current = false;

    const onTyping = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const from = r.from == null ? null : String(r.from);
      if (from && from !== me?.id) setTypingFrom(r.isTyping ? from : null);
    };

    const onNew = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const raw = r.message as Msg | undefined;
      if (!raw || typeof raw.id !== "string") return;
      const m = {
        ...raw,
        reactions: normalizeReactions(raw.reactions),
        event: normalizeEvent(raw.event),
      };
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      if (m.from !== me?.id) {
        s.emit("chat:delivered", { messageIds: [m.id] });
        s.emit("chat:read", { messageIds: [m.id] });
      }
    };

    const onEdited = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const m = r.message as Msg | undefined;
      if (!m || typeof m.id !== "string") return;
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
      );
    };

    const onDeleted = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const id = typeof r.messageId === "string" ? r.messageId : "";
      if (!id) return;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                text: null,
                item: null,
                reactions: [],
                deletedAt: new Date().toISOString(),
              }
            : x,
        ),
      );
    };

    const onReceipt = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const ids: string[] = Array.isArray(r.messageIds)
        ? (r.messageIds as string[])
        : [];
      const uid: string | undefined =
        typeof r.userId === "string" ? r.userId : undefined;
      const at: string =
        typeof r.at === "string" ? r.at : new Date().toISOString();
      const typ: "delivered" | "read" | undefined =
        r.type === "delivered" || r.type === "read" ? r.type : undefined;
      if (!uid || ids.length === 0 || !typ) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!ids.includes(m.id)) return m;
          if (m.from !== me?.id) return m;
          const existing = m.receipts?.find((r) => r.userId === uid);
          const receipts = existing
            ? m.receipts.map((r) =>
                r.userId !== uid
                  ? r
                  : {
                      ...r,
                      deliveredAt: r.deliveredAt ?? at,
                      readAt: typ === "read" ? at : r.readAt,
                    },
              )
            : [
                ...(m.receipts ?? []),
                {
                  userId: uid,
                  deliveredAt: at,
                  readAt: typ === "read" ? at : undefined,
                },
              ];
          return { ...m, receipts };
        }),
      );
    };

    const onReaction = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageId = r.messageId == null ? null : String(r.messageId);
      const emoji = typeof r.emoji === "string" ? r.emoji : null;
      const userId = r.userId == null ? null : String(r.userId);
      const action: "added" | "removed" | undefined =
        r.action === "added" || r.action === "removed" ? r.action : undefined;
      const at: string =
        typeof r.at === "string" ? r.at : new Date().toISOString();
      const userRec = asRecord(r.user);
      const user = userId
        ? {
            id: typeof userRec?.id === "string" ? userRec.id : userId,
            username:
              typeof userRec?.username === "string"
                ? userRec.username
                : reactionUserDirectory.get(userId)?.username,
            email:
              typeof userRec?.email === "string"
                ? userRec.email
                : reactionUserDirectory.get(userId)?.email,
          }
        : undefined;
      if (!messageId || !emoji || !userId || !action) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return applyReactionActionLocal(m, userId, emoji, action, at, user);
        }),
      );
    };

    s.on("chat:typing", onTyping);
    s.on("chat:message", onNew);
    s.on("share:item", onNew);
    s.on("chat:message:edited", onEdited);
    s.on("chat:message:deleted", onDeleted);
    s.on("chat:receipt", onReceipt);
    s.on("chat:reaction", onReaction);

    return () => {
      s.off("chat:typing", onTyping);
      s.off("chat:message", onNew);
      s.off("share:item", onNew);
      s.off("chat:message:edited", onEdited);
      s.off("chat:message:deleted", onDeleted);
      s.off("chat:receipt", onReceipt);
      s.off("chat:reaction", onReaction);
    };
  }, [chatId, me?.id, reactionUserDirectory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,252,253,0.96),rgba(255,238,245,0.9))] shadow-[0_24px_80px_rgba(102,24,61,0.12)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-6%] top-[-8%] h-56 w-56 rounded-full bg-[color:var(--peach-200)]/45 blur-3xl" />
        <div className="absolute right-[-8%] top-[18%] h-64 w-64 rounded-full bg-[color:var(--rose-600)]/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[24%] h-72 w-72 rounded-full bg-white/35 blur-3xl" />
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--wine-900)]/8 bg-white/64 px-4 pb-4 pt-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/avatars/default-love.svg"
            alt=""
            className="h-11 w-11 rounded-[18px] border border-white/70 bg-white/75 p-1 shadow-[0_10px_24px_rgba(126,35,75,0.12)]"
          />
          <div className="min-w-0">
            <div className="truncate font-[family-name:var(--font-serif)] text-[1.35rem] text-[color:var(--wine-900)]">
              {otherDisplayName}
              <span className="ml-2 inline-flex rounded-full bg-[color:var(--rose-600)]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[color:var(--rose-700)]">
                DM
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[color:var(--wine-900)]/62">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  presence?.isOnline
                    ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
                    : "bg-[color:var(--wine-900)]/18"
                }`}
              />
              {typingFrom ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="typing-dots"
                    aria-label="Typing"
                    title="Typing"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>{otherDisplayName} is typing</span>
                </span>
              ) : presence?.isOnline ? (
                conversationStatus
              ) : presence?.lastSeenAt ? (
                formatLastSeen(presence.lastSeenAt)
              ) : (
                " "
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-[color:var(--wine-900)]/8 bg-white/72 px-3.5 py-2 text-[13px] font-semibold text-[color:var(--wine-900)] shadow-sm transition hover:bg-white"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "audio");
            }}
            title="Audio call"
            type="button"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </button>
          <button
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-[color:var(--rose-600)] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(198,43,105,0.25)] transition hover:bg-[color:var(--rose-700)]"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "video");
            }}
            title="Video call"
            type="button"
          >
            <Video className="h-3.5 w-3.5" /> Video
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-2.5 pb-2.5 pt-3 sm:px-3 sm:pb-3">
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/65 bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_14px_38px_rgba(98,19,57,0.07)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.24),transparent_24%,transparent_76%,rgba(255,255,255,0.22))]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,216,230,0.38),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(198,43,105,0.08),transparent_28%)]" />
          </div>
          <div className="relative mt-0.5 min-h-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto px-2.5 py-3 sm:px-3">
            {messages.map((m) => {
              if (m.type === "event") {
                const label =
                  m.event?.kind === "call_started"
                    ? `${m.event.media === "video" ? "Video" : "Audio"} call started`
                    : m.event?.kind === "call_ended"
                      ? `${m.event.media === "video" ? "Video" : "Audio"} call ended`
                      : "Event";
                const duration =
                  typeof m.event?.durationMs === "number" &&
                  m.event.durationMs > 0
                    ? ` · ${formatElapsed(m.event.durationMs)}`
                    : "";
                return (
                  <div key={m.id} className="flex justify-center py-1">
                    <div className="rounded-full border border-white/70 bg-white/82 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--wine-900)]/58 shadow-sm">
                      {label}
                      <span className="tabular-nums">{duration}</span>
                    </div>
                  </div>
                );
              }

              const mine = m.from === me?.id;
              const reactions = m.reactions ?? [];
              const reactionGroups = groupReactions(
                reactions,
                me?.id ?? "",
                reactionUserLabels,
              );
              const reactionSummary = reactionGroups
                .map(
                  (reaction) =>
                    reaction.emoji +
                    " " +
                    formatReactionUsers(reaction.userLabels),
                )
                .join(" · ");
              const reactionsOpen = openReactionFor === m.id;
              return (
                <div
                  key={m.id}
                  className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`group relative flex w-full min-w-0 max-w-[min(100%,42rem)] items-end gap-1.5 sm:max-w-[min(100%,48rem)] ${mine ? "flex-row-reverse self-end" : "self-start"}`}
                  >
                    <div
                      className={`relative min-w-0 overflow-hidden rounded-[24px] border px-3.5 py-2.5 text-[13px] shadow-[0_14px_26px_rgba(116,34,70,0.07)] ${
                        mine
                          ? "border-[color:var(--rose-600)]/22 bg-[linear-gradient(165deg,rgba(255,225,236,0.98),rgba(255,206,226,0.94))] text-[color:var(--wine-900)]"
                          : "border-[color:var(--wine-900)]/8 bg-[linear-gradient(165deg,rgba(255,255,255,0.98),rgba(248,241,255,0.9))] text-[color:var(--wine-900)]"
                      }`}
                    >
                      {!mine ? (
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--rose-700)]/78">
                          {otherDisplayName}
                        </div>
                      ) : null}

                      {m.deletedAt ? (
                        <span className="italic text-black/50">
                          Message deleted
                        </span>
                      ) : editingId === m.id ? (
                        <div className="grid gap-2">
                          <textarea
                            className="focus-ring w-full resize-none rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-[color:var(--wine-900)]"
                            rows={3}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-3 py-2 text-xs font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft("");
                              }}
                              type="button"
                            >
                              <X className="h-4 w-4" /> Cancel
                            </button>
                            <button
                              className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--rose-700)]"
                              onClick={async () => {
                                const next = editDraft.trim();
                                if (!next) return;
                                await apiFetch(
                                  `/api/chats/${chatId}/messages/${m.id}`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ text: next }),
                                  },
                                );
                                setMessages((prev) =>
                                  prev.map((x) =>
                                    x.id === m.id
                                      ? {
                                          ...x,
                                          text: next,
                                          editedAt: new Date().toISOString(),
                                        }
                                      : x,
                                  ),
                                );
                                setEditingId(null);
                                setEditDraft("");
                              }}
                              type="button"
                            >
                              <Check className="h-4 w-4" /> Save
                            </button>
                          </div>
                        </div>
                      ) : m.type === "share" &&
                        (m.item?.url || m.item?.legacyUrl) ? (
                        <Attachment item={m.item} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words leading-5">
                          {m.text}
                        </div>
                      )}

                      {reactionGroups.length ? (
                        <div className="mt-2 max-w-full rounded-[16px] bg-white/40 px-2 py-1.5 ring-1 ring-white/40">
                          <div className="flex max-w-full flex-wrap gap-1 overflow-hidden">
                            {reactionGroups.map((r) => (
                              <button
                                key={r.emoji}
                                type="button"
                                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium shadow-sm transition ${
                                  r.me
                                    ? "border-[color:var(--rose-600)]/18 bg-[color:var(--rose-600)]/12 text-[color:var(--rose-800)]"
                                    : "border-black/5 bg-white/72 text-black/70"
                                }`}
                                onClick={() => emitReaction(m.id, r.emoji)}
                                title={formatReactionUsers(r.userLabels)}
                                aria-label={formatReactionUsers(r.userLabels)}
                              >
                                <span className="text-[13px] leading-none">
                                  {r.emoji}
                                </span>
                                <span className="tabular-nums">{r.count}</span>
                              </button>
                            ))}
                          </div>
                          <div
                            className="mt-1 max-w-full truncate text-[9px] leading-4 text-black/55"
                            title={reactionSummary}
                          >
                            {reactionSummary}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[color:var(--wine-900)]/42">
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {mine ? (
                          <span className="ml-1.5 inline-flex items-center">
                            <ReceiptMark m={m} otherUserId={otherUserId} />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {!m.deletedAt && editingId !== m.id ? (
                      <div className="relative flex shrink-0 flex-col items-center gap-1.5">
                        <button
                          type="button"
                          className="focus-ring grid h-8 w-8 place-items-center rounded-[18px] border border-white/70 bg-white/82 text-[color:var(--wine-900)]/64 shadow-sm transition hover:bg-white"
                          onClick={() =>
                            setOpenReactionFor((cur) =>
                              cur === m.id ? null : m.id,
                            )
                          }
                          aria-label="Reactions"
                          title="Reactions"
                        >
                          <SmilePlus className="h-3.5 w-3.5" />
                        </button>

                        <div
                          className={`absolute top-10 z-10 max-w-[200px] flex-wrap items-center gap-1 rounded-[18px] border border-white/70 bg-white/92 p-1 shadow-[0_12px_28px_rgba(95,22,56,0.16)] backdrop-blur ${
                            reactionsOpen ? "flex" : "hidden"
                          } ${mine ? "right-0" : "left-0"}`}
                        >
                          {QUICK_REACTIONS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              className="grid h-7 w-7 place-items-center rounded-[16px] transition hover:bg-[color:var(--rose-600)]/10"
                              onClick={() => emitReaction(m.id, e)}
                              aria-label={`React ${e}`}
                            >
                              <span className="text-sm leading-none">{e}</span>
                            </button>
                          ))}
                        </div>

                        {mine ? (
                          <div className="flex items-center gap-1 rounded-[18px] border border-white/70 bg-white/82 p-1 shadow-sm md:pointer-events-none md:opacity-0 md:transition md:group-hover:pointer-events-auto md:group-hover:opacity-100">
                            {m.type === "text" ? (
                              <button
                                className="focus-ring grid h-7 w-7 place-items-center rounded-[16px] text-[color:var(--wine-900)]/62 hover:bg-black/5"
                                onClick={() => {
                                  setEditingId(m.id);
                                  setEditDraft(m.text ?? "");
                                }}
                                type="button"
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              className="focus-ring grid h-8 w-8 place-items-center rounded-2xl text-[color:var(--wine-900)]/62 hover:bg-black/5"
                              onClick={async () => {
                                await apiFetch(
                                  `/api/chats/${chatId}/messages/${m.id}`,
                                  { method: "DELETE" },
                                );
                                setMessages((prev) =>
                                  prev.map((x) =>
                                    x.id === m.id
                                      ? {
                                          ...x,
                                          text: null,
                                          item: null,
                                          reactions: [],
                                          deletedAt: new Date().toISOString(),
                                        }
                                      : x,
                                  ),
                                );
                              }}
                              type="button"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {typingFrom ? (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-[20px] border border-white/70 bg-white/85 px-3 py-2.5 text-[13px] text-[color:var(--wine-900)]/70 shadow-sm">
                  <span
                    className="typing-dots"
                    aria-label="Typing"
                    title="Typing"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>{otherDisplayName} is typing</span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="relative border-t border-[color:var(--wine-900)]/8 bg-white/68 px-2.5 pb-2.5 pt-2.5 backdrop-blur-xl sm:px-3 sm:pb-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!otherUserId || !text.trim()) return;
              const s = ensureSocket();
              const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
              s.emit("chat:message", {
                to: otherUserId,
                text: text.trim(),
                clientMessageId,
              });
              setText("");
              emitTyping(false);
            }}
          >
            <div className="flex items-end gap-2 rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,245,249,0.88))] p-1.5 shadow-[0_14px_28px_rgba(111,27,64,0.09)]">
              <label className="focus-ring inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[16px] bg-[color:var(--rose-600)]/10 text-[color:var(--rose-700)] transition hover:bg-[color:var(--rose-600)]/16">
                <Paperclip className="h-3.5 w-3.5" />
                <input
                  className="hidden"
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !otherUserId) return;
                    const up = await uploadFile(file);
                    const s = ensureSocket();
                    const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
                    s.emit("share:item", {
                      to: otherUserId,
                      item: up.item,
                      clientMessageId,
                    });
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[color:var(--wine-900)]/38">
                  Send a message
                </div>
                <input
                  className="focus-ring w-full rounded-[18px] border border-transparent bg-transparent px-2.5 py-2 text-[13px] text-[color:var(--wine-900)] placeholder:text-[color:var(--wine-900)]/34"
                  placeholder="Write something sweet..."
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    emitTyping(true);
                    if (typingTimer.current)
                      window.clearTimeout(typingTimer.current);
                    typingTimer.current = window.setTimeout(() => {
                      emitTyping(false);
                    }, 1200);
                  }}
                  onBlur={() => emitTyping(false)}
                />
              </div>
              <button
                className="focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[16px] bg-[linear-gradient(135deg,var(--rose-600),#e05a97)] px-3.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(198,43,105,0.2)] transition hover:brightness-105"
                type="submit"
              >
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function toAbsoluteUrl(url: string) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE_URL}${path}`;
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function Attachment({ item }: { item: ShareItem }) {
  const kind = String(item.kind ?? "file");
  const mime = String(item.mime ?? item.contentType ?? "");
  const url = toAbsoluteUrl(String(item.url ?? item.legacyUrl ?? ""));
  const name = String(item.originalName ?? item.filename ?? "Attachment");
  const size = typeof item.size === "number" ? item.size : undefined;

  const lowerName = name.toLowerCase();
  const isImageByExt = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/.test(
    lowerName,
  );
  const isVideoByExt = /\.(mp4|webm|mov|m4v|mkv|avi)$/.test(lowerName);
  const isAudioByExt = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(lowerName);

  const effectiveKind =
    kind !== "file"
      ? kind
      : mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : isImageByExt
              ? "image"
              : isVideoByExt
                ? "video"
                : isAudioByExt
                  ? "audio"
                  : "file";

  if (effectiveKind === "image")
    return <ImageAttachment url={url} name={name} size={size} />;

  if (effectiveKind === "video") {
    return <VideoAttachment url={url} name={name} size={size} />;
  }

  if (effectiveKind === "audio") {
    return (
      <div className="grid gap-2">
        <audio src={url} controls className="w-full" />
        <a
          className="text-[10px] underline text-black/55"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {name}
        </a>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl bg-white/70 px-3 py-2 hover:bg-white"
    >
      <div className="flex items-center gap-2">
        {mime.includes("pdf") || name.toLowerCase().endsWith(".pdf") ? (
          <FileText className="h-4 w-4 text-black/45" />
        ) : (
          <FileIcon className="h-4 w-4 text-black/45" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[color:var(--wine-900)]">
            {name}
          </div>
          <div className="text-[10px] text-black/55">
            {size ? formatBytes(size) : "File"}
          </div>
        </div>
        <Download className="h-4 w-4 text-black/45" />
      </div>
    </a>
  );
}

function ImageAttachment({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size?: number;
}) {
  return <RomanticImageAttachment url={url} name={name} size={size} />;
}

function VideoAttachment({
  url,
  name,
  size,
}: {
  url: string;
  name: string;
  size?: number;
}) {
  return <RomanticVideoAttachment url={url} name={name} size={size} />;
}

function receiptStatus(m: Msg, otherUserId: string | null) {
  if (!otherUserId) return "sent" as const;
  const r = m.receipts?.find((x) => x.userId === otherUserId);
  if (!r) return "sent" as const;
  if (r.readAt) return "read" as const;
  if (r.deliveredAt) return "delivered" as const;
  return "sent" as const;
}

function ReceiptMark({
  m,
  otherUserId,
}: {
  m: Msg;
  otherUserId: string | null;
}) {
  const s = receiptStatus(m, otherUserId);
  if (s === "sent") return <Check className="h-3.5 w-3.5 text-black/40" />;
  if (s === "delivered")
    return <CheckCheck className="h-3.5 w-3.5 text-black/40" />;
  return <CheckCheck className="h-3.5 w-3.5 text-[color:var(--rose-700)]" />;
}

function groupReactions(
  reactions: NonNullable<Msg["reactions"]>,
  meId: string,
  labels: Map<string, string>,
): ReactionGroup[] {
  const byEmoji = new Map<string, ReactionGroup>();
  for (const reaction of reactions) {
    const label =
      reaction.userId === meId
        ? "You"
        : reaction.user?.username?.trim() ||
          reaction.user?.email?.trim() ||
          labels.get(reaction.userId) ||
          "Unknown";
    const prev = byEmoji.get(reaction.emoji);
    if (!prev) {
      byEmoji.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        me: reaction.userId === meId,
        userIds: [reaction.userId],
        userLabels: [label],
      });
      continue;
    }
    prev.count += 1;
    if (reaction.userId === meId) prev.me = true;
    if (!prev.userIds.includes(reaction.userId))
      prev.userIds.push(reaction.userId);
    if (!prev.userLabels.includes(label)) prev.userLabels.push(label);
  }
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
}

function formatReactionUsers(userLabels: string[]) {
  const unique = Array.from(new Set(userLabels.filter(Boolean))).sort(
    (a, b) => {
      if (a === "You") return -1;
      if (b === "You") return 1;
      return a.localeCompare(b);
    },
  );
  if (unique.length <= 2) return unique.join(", ");
  return `${unique[0]}, ${unique[1]} +${unique.length - 2}`;
}

function toggleReactionLocal(
  msg: Msg,
  meId: string,
  emoji: string,
  user?: ReactionUser,
): Msg {
  const reactions = msg.reactions ?? [];
  const exists = reactions.some((r) => r.emoji === emoji && r.userId === meId);
  return exists
    ? {
        ...msg,
        reactions: reactions.filter(
          (r) => !(r.emoji === emoji && r.userId === meId),
        ),
      }
    : {
        ...msg,
        reactions: [
          ...reactions,
          { emoji, userId: meId, createdAt: new Date().toISOString(), user },
        ],
      };
}
