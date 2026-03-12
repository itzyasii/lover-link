"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, uploadFile } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
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

type Chat = {
  id: string;
  type: "dm";
  members: { id: string; email?: string; username?: string }[];
};

type Msg = {
  id: string;
  chatId: string;
  from: string;
  type: "text" | "share";
  text: string | null;
  item: any | null;
  receipts: { userId: string; deliveredAt?: string; readAt?: string }[];
  reactions?: { emoji: string; userId: string; createdAt: string }[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡"] as const;

export default function ChatPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const me = useAuthStore((s) => s.user);
  const { startCall } = useCall();
  const [text, setText] = useState("");
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const typingTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
  });

  const chat = useMemo(
    () => chatsQuery.data?.chats.find((c) => c.id === chatId) ?? null,
    [chatsQuery.data, chatId],
  );

  const otherUserId = useMemo(() => {
    if (!chat || !me) return null;
    const ids = chat.members.map((m) => m.id);
    return ids.find((id) => id !== me.id) ?? null;
  }, [chat, me]);

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

  useEffect(() => {
    if (!chatId) return;
    void apiFetch<{ ok: true; messages: Msg[]; nextCursor: string | null }>(
      `/api/chats/${chatId}/messages?limit=50`,
    )
      .then((r) =>
        setMessages(
          r.messages.map((m) => ({ ...m, reactions: m.reactions ?? [] })),
        ),
      )
      .catch(() => setMessages([]));
  }, [chatId]);

  useEffect(() => {
    const s = getSocket();

    const onTyping = (p: any) => {
      if (p?.chatId !== chatId) return;
      if (p?.from && p.from !== me?.id) {
        setTypingFrom(p.isTyping ? p.from : null);
      }
    };

    const onNew = (p: any) => {
      if (p?.chatId !== chatId) return;
      const raw = p?.message as Msg | undefined;
      if (!raw) return;
      const m = { ...raw, reactions: raw.reactions ?? [] };
      setMessages((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      if (m.from !== me?.id) {
        s.emit("chat:delivered", { messageIds: [m.id] });
        s.emit("chat:read", { messageIds: [m.id] });
      }
    };

    const onEdited = (p: any) => {
      if (p?.chatId !== chatId) return;
      const m = p?.message as Msg | undefined;
      if (!m) return;
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
      );
    };

    const onDeleted = (p: any) => {
      if (p?.chatId !== chatId) return;
      const id = p?.messageId as string | undefined;
      if (!id) return;
      setMessages((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                text: null,
                item: null,
                deletedAt: new Date().toISOString(),
              }
            : x,
        ),
      );
    };

    const onReceipt = (p: any) => {
      if (p?.chatId !== chatId) return;
      const ids: string[] = Array.isArray(p?.messageIds) ? p.messageIds : [];
      const uid: string | undefined = p?.userId;
      const at: string = p?.at ?? new Date().toISOString();
      const typ: "delivered" | "read" | undefined = p?.type;
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

    const onReaction = (p: any) => {
      const messageId: string | undefined = p?.messageId;
      const emoji: string | undefined = p?.emoji;
      const userId: string | undefined = p?.userId;
      const action: "added" | "removed" | undefined = p?.action;
      const at: string = p?.at ?? new Date().toISOString();
      if (!messageId || !emoji || !userId || !action) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions ?? [];
          if (action === "added") {
            if (reactions.some((r) => r.emoji === emoji && r.userId === userId))
              return m;
            return {
              ...m,
              reactions: [...reactions, { emoji, userId, createdAt: at }],
            };
          }
          return {
            ...m,
            reactions: reactions.filter(
              (r) => !(r.emoji === emoji && r.userId === userId),
            ),
          };
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
  }, [chatId, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-4">
        <div>
          <div className="text-sm font-semibold text-[color:var(--wine-900)]">
            {chat?.members.find((m) => m.id !== me?.id)?.username ?? "Chat"}
          </div>
          <div className="text-xs text-black/55">
            {typingFrom
              ? "Typing…"
              : presence?.isOnline
                ? "Online"
                : presence?.lastSeenAt
                  ? formatLastSeen(presence.lastSeenAt)
                  : " "}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-3 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "audio");
            }}
            title="Audio call"
            type="button"
          >
            <Phone className="h-4 w-4" /> Audio
          </button>
          <button
            className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-black/5 px-3 py-2 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "video");
            }}
            title="Video call"
            type="button"
          >
            <Video className="h-4 w-4" /> Video
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-auto pr-1">
        {messages.map((m) => {
          const mine = m.from === me?.id;
          const reactions = m.reactions ?? [];
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`group flex max-w-[78%] items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`rounded-3xl px-4 py-3 text-sm ${
                    mine
                      ? "bg-[color:var(--peach-200)] text-[color:var(--wine-900)]"
                      : "bg-white/70 text-black/80"
                  }`}
                >
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
                  ) : m.type === "share" && m.item?.url ? (
                    <Attachment item={m.item} />
                  ) : (
                    m.text
                  )}

                  {reactions.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {groupReactions(reactions, me?.id ?? "").map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${
                            r.me
                              ? "bg-[color:var(--rose-600)]/15 text-[color:var(--rose-800)]"
                              : "bg-black/5 text-black/70"
                          }`}
                          onClick={() => {
                            if (!me?.id) return;
                            const s = getSocket();
                            s.emit("chat:react", {
                              messageId: m.id,
                              emoji: r.emoji,
                            });
                            setMessages((prev) =>
                              prev.map((x) =>
                                x.id === m.id
                                  ? toggleReactionLocal(x, me.id, r.emoji)
                                  : x,
                              ),
                            );
                          }}
                          title="Toggle reaction"
                        >
                          <span className="text-base leading-none">
                            {r.emoji}
                          </span>
                          <span className="tabular-nums">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-1 text-[10px] text-black/45">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {mine ? (
                      <span className="ml-2 inline-flex items-center">
                        <ReceiptMark m={m} otherUserId={otherUserId} />
                      </span>
                    ) : null}
                  </div>
                </div>

                {!m.deletedAt && editingId !== m.id ? (
                  <div className="pointer-events-none flex flex-col items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <div className="pointer-events-auto flex items-center gap-1 rounded-2xl bg-white/70 p-1 shadow-sm">
                      <SmilePlus className="h-4 w-4 text-black/45" />
                      {QUICK_REACTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-xl hover:bg-black/5"
                          onClick={() => {
                            if (!me?.id) return;
                            const s = getSocket();
                            s.emit("chat:react", { messageId: m.id, emoji: e });
                            setMessages((prev) =>
                              prev.map((x) =>
                                x.id === m.id
                                  ? toggleReactionLocal(x, me.id, e)
                                  : x,
                              ),
                            );
                          }}
                          aria-label={`React ${e}`}
                        >
                          <span className="text-base leading-none">{e}</span>
                        </button>
                      ))}
                    </div>

                    {mine ? (
                      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl bg-white/70 p-1 shadow-sm">
                        {m.type === "text" ? (
                          <button
                            className="focus-ring grid h-8 w-8 place-items-center rounded-2xl text-black/60 hover:bg-black/5"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditDraft(m.text ?? "");
                            }}
                            type="button"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          className="focus-ring grid h-8 w-8 place-items-center rounded-2xl text-black/60 hover:bg-black/5"
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
                                      deletedAt: new Date().toISOString(),
                                    }
                                  : x,
                              ),
                            );
                          }}
                          type="button"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-4 flex items-center gap-2 border-t border-black/10 pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!otherUserId || !text.trim()) return;
          const s = getSocket();
          const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          s.emit("chat:message", {
            to: otherUserId,
            text: text.trim(),
            clientMessageId,
          });
          setText("");
          s.emit("chat:typing", { chatId, isTyping: false });
        }}
      >
        <label className="focus-ring inline-flex cursor-pointer items-center justify-center rounded-2xl bg-black/5 p-3 hover:bg-black/10">
          <Paperclip className="h-4 w-4 text-black/60" />
          <input
            className="hidden"
            type="file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !otherUserId) return;
              const up = await uploadFile(file);
              const s = getSocket();
              const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
              s.emit("share:item", {
                to: otherUserId,
                item: up.item,
                clientMessageId,
              });
            }}
          />
        </label>
        <input
          className="focus-ring flex-1 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm"
          placeholder="Write something sweet…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const s = getSocket();
            s.emit("chat:typing", { chatId, isTyping: true });
            if (typingTimer.current) window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(() => {
              s.emit("chat:typing", { chatId, isTyping: false });
            }, 1200);
          }}
          onBlur={() =>
            getSocket().emit("chat:typing", { chatId, isTyping: false })
          }
        />
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rose-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--rose-700)]"
          type="submit"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  );
}

function toAbsoluteUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
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

function Attachment({ item }: { item: any }) {
  const kind = String(item.kind ?? "file");
  const mime = String(item.mime ?? item.contentType ?? "");
  const url = toAbsoluteUrl(String(item.url ?? ""));
  const name = String(item.originalName ?? item.filename ?? "Attachment");
  const size = typeof item.size === "number" ? item.size : undefined;

  const effectiveKind =
    kind !== "file"
      ? kind
      : mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "file";

  if (effectiveKind === "image")
    return <ImageAttachment url={url} name={name} size={size} />;

  if (effectiveKind === "video") {
    return (
      <div className="grid gap-2">
        <video
          src={url}
          controls
          className="max-h-[520px] w-full rounded-2xl bg-black/10"
        />
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => setOpen(true)}
      >
        <div className="overflow-hidden rounded-2xl bg-black/5">
          <img
            src={url}
            alt={name}
            className="max-h-[520px] w-full object-contain"
            loading="lazy"
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-black/55">
          <span className="truncate">{name}</span>
          {size ? (
            <span className="shrink-0 tabular-nums">{formatBytes(size)}</span>
          ) : null}
        </div>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end pb-2">
              <button
                type="button"
                className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-2 text-xs font-semibold text-black/70 hover:bg-white"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>
            <div className="overflow-hidden rounded-3xl bg-black">
              <img
                src={url}
                alt={name}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
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
  reactions: { emoji: string; userId: string }[],
  meId: string,
) {
  const byEmoji = new Map<
    string,
    { emoji: string; count: number; me: boolean }
  >();
  for (const r of reactions) {
    const prev = byEmoji.get(r.emoji);
    if (!prev) {
      byEmoji.set(r.emoji, { emoji: r.emoji, count: 1, me: r.userId === meId });
    } else {
      prev.count += 1;
      if (r.userId === meId) prev.me = true;
    }
  }
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
}

function toggleReactionLocal(msg: Msg, meId: string, emoji: string): Msg {
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
          { emoji, userId: meId, createdAt: new Date().toISOString() },
        ],
      };
}
