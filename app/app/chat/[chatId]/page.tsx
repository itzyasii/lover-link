"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  LoaderCircle,
  Mic,
  Paperclip,
  Pencil,
  Phone,
  Send,
  SmilePlus,
  Square,
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
  members: ChatMember[];
};

type ChatMember = string | { id: string; email?: string; username?: string };

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
  receipts: {
    userId: string;
    deliveredAt?: string;
    readAt?: string;
    listenedAt?: string;
  }[];
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

function memberId(member: ChatMember) {
  return typeof member === "string" ? member : member.id;
}

function memberLabel(member: ChatMember | null | undefined) {
  if (!member || typeof member === "string") return "";
  return member.username?.trim() || member.email?.trim() || "";
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

function detectVoiceMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined")
    return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  const markMessagesRead = useCallback(
    (targetMessages: Msg[]) => {
      if (!me?.id) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;

      const unreadIds = targetMessages
        .filter((message) => {
          if (message.from === me.id) return false;
          if (message.deletedAt) return false;
          const receipt = message.receipts?.find(
            (entry) => entry.userId === me.id,
          );
          return !receipt?.readAt;
        })
        .map((message) => message.id);

      if (!unreadIds.length) return;
      ensureSocket().emit("chat:read", { messageIds: unreadIds });
    },
    [me?.id],
  );

  const markVoiceListened = useCallback(
    (messageId: string) => {
      if (!me?.id) return;
      const message = messages.find((entry) => entry.id === messageId);
      if (!message || message.from === me.id) return;
      const receipt = message.receipts?.find((entry) => entry.userId === me.id);
      if (receipt?.listenedAt) return;

      const at = new Date().toISOString();
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id !== messageId
            ? entry
            : {
                ...entry,
                receipts: (() => {
                  const existing = entry.receipts?.find(
                    (item) => item.userId === me.id,
                  );
                  if (existing) {
                    return (entry.receipts ?? []).map((item) =>
                      item.userId !== me.id
                        ? item
                        : {
                            ...item,
                            deliveredAt: item.deliveredAt ?? at,
                            readAt: item.readAt ?? at,
                            listenedAt: item.listenedAt ?? at,
                          },
                    );
                  }
                  return [
                    ...(entry.receipts ?? []),
                    {
                      userId: me.id,
                      deliveredAt: at,
                      readAt: at,
                      listenedAt: at,
                    },
                  ];
                })(),
              },
        ),
      );

      ensureSocket().emit("chat:voice:listened", { messageId });
    },
    [me?.id, messages],
  );

  const ensureSocket = () => {
    const s = getSocket();
    if (!s.connected) s.connect();
    return s;
  };

  const clearVoiceRecorder = () => {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingStartedAtRef.current = null;
    recordingChunksRef.current = [];
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecordingVoice(false);
    setVoiceDurationMs(0);
  };

  const sendVoiceMessage = async (
    blob: Blob,
    mimeType: string,
    durationMs: number,
  ) => {
    if (!otherUserId) return;

    setIsSendingVoice(true);
    try {
      const extension = mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mp4")
          ? "m4a"
          : "webm";
      const file = new File(
        [blob],
        `voice-message-${Date.now()}.${extension}`,
        {
          type: mimeType || "audio/webm",
        },
      );
      const upload = await uploadFile(file, false);
      const uploadedItem = asRecord(upload.item) ?? {};
      const uploadedMeta = asRecord(uploadedItem.meta) ?? {};
      const s = ensureSocket();
      const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      // Optimistically add voice message to local state immediately
      const optimisticVoiceMessage: Msg = {
        id: clientMessageId,
        from: me!.id,
        chatId: chatId,
        item: {
          ...uploadedItem,
          kind: "audio",
          meta: {
            ...uploadedMeta,
            voiceNote: true,
            durationMs,
          },
        },
        createdAt: new Date().toISOString(),
        deletedAt: null,
        editedAt: null,
        reactions: [],
        receipts: [],
        type: "share",
        text: null,
        event: null,
      };
      setMessages((prev) => [...prev, optimisticVoiceMessage]);

      s.emit("share:item", {
        to: otherUserId,
        item: {
          ...uploadedItem,
          kind: "audio",
          meta: {
            ...uploadedMeta,
            voiceNote: true,
            durationMs,
          },
        },
        clientMessageId,
      });
      // Force scroll to bottom after sending message
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      toast({
        title: "Voice message failed",
        message: "Could not upload and send this recording.",
        tone: "error",
      });
    } finally {
      setIsSendingVoice(false);
    }
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const startVoiceRecording = async () => {
    if (!otherUserId || isRecordingVoice || isSendingVoice) return;
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      toast({
        title: "Voice messages unavailable",
        message: "This browser does not support in-app audio recording.",
        tone: "error",
      });
      return;
    }

    try {
      const mimeType = detectVoiceMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      setIsRecordingVoice(true);
      setVoiceDurationMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const chunks = [...recordingChunksRef.current];
        const durationMs = Math.max(
          0,
          Date.now() - (recordingStartedAtRef.current ?? Date.now()),
        );
        const outputMimeType = recorder.mimeType || mimeType || "audio/webm";
        clearVoiceRecorder();
        if (!chunks.length) return;
        void sendVoiceMessage(
          new Blob(chunks, { type: outputMimeType }),
          outputMimeType,
          durationMs,
        );
      };

      recorder.start(250);
      recordingTimerRef.current = window.setInterval(() => {
        setVoiceDurationMs(
          Math.max(
            0,
            Date.now() - (recordingStartedAtRef.current ?? Date.now()),
          ),
        );
      }, 250);
    } catch {
      clearVoiceRecorder();
      toast({
        title: "Recording failed",
        message: "Could not access the microphone for a voice message.",
        tone: "error",
      });
    }
  };

  const emitTyping = (isTyping: boolean) => {
    const s = ensureSocket();
    s.emit("chat:typing", { chatId, isTyping }, (ack?: { ok: boolean }) => {
      if (ack?.ok) return;
      if (typingAckFailedOnce.current) return;
      typingAckFailedOnce.current = true;
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
    const ids = resolvedChat.members.map(memberId);
    return ids.find((id) => id !== me.id) ?? null;
  }, [resolvedChat, me]);

  const reactionUserDirectory = useMemo(() => {
    const users = new Map<string, ReactionUser>();
    for (const member of resolvedChat?.members ?? []) {
      const id = memberId(member);
      const rec = typeof member === "string" ? null : member;
      users.set(id, {
        id,
        username: rec?.username,
        email: rec?.email,
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

  // Track online status via socket.io instead of REST polling (per FRONTEND_INTEGRATION.md)
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [otherUserLastSeen, setOtherUserLastSeen] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!otherUserId) return;

    const s = getSocket();
    if (!s.connected) s.connect();

    // Get initial online users list
    s.emit("presence:list", (response: { ok: boolean; users: string[] }) => {
      if (response.ok) {
        setIsOtherUserOnline(response.users.includes(otherUserId));
      }
    });

    // Listen for presence updates (when users come online/go offline)
    const handlePresenceUpdate = (data: { ok: boolean; users: string[] }) => {
      if (data.ok) {
        setIsOtherUserOnline(data.users.includes(otherUserId));
      }
    };

    // Initial online list on connect
    const handlePresenceOnline = (data: { ok: boolean; users: string[] }) => {
      if (data.ok) {
        setIsOtherUserOnline(data.users.includes(otherUserId));
      }
    };

    s.on("presence:update", handlePresenceUpdate);
    s.on("presence:online", handlePresenceOnline);

    return () => {
      s.off("presence:update", handlePresenceUpdate);
      s.off("presence:online", handlePresenceOnline);
    };
  }, [otherUserId]);

  // Create presence object for compatibility with existing code
  const presence = {
    isOnline: isOtherUserOnline,
    lastSeenAt: otherUserLastSeen,
  };
  const otherMember =
    resolvedChat?.members.find((member) => memberId(member) !== me?.id) ?? null;
  const otherDisplayName = memberLabel(otherMember) || "Chat";
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
    markMessagesRead(messages);
  }, [messages, markMessagesRead]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") markMessagesRead(messages);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [messages, markMessagesRead]);

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
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          s.emit("chat:read", { messageIds: [m.id] });
        } else {
          // Play sound if tab is in background
          import("@/lib/sounds").then(({ playMessageSound }) =>
            playMessageSound(),
          );
        }
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
                      listenedAt: r.listenedAt,
                    },
              )
            : [
                ...(m.receipts ?? []),
                {
                  userId: uid,
                  deliveredAt: at,
                  readAt: typ === "read" ? at : undefined,
                  listenedAt: undefined,
                },
              ];
          return { ...m, receipts };
        }),
      );
    };

    const onVoiceListened = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (String(r.chatId ?? "") !== chatId) return;
      const messageId = typeof r.messageId === "string" ? r.messageId : "";
      const userId = typeof r.userId === "string" ? r.userId : "";
      const at = typeof r.at === "string" ? r.at : new Date().toISOString();
      if (!messageId || !userId) return;

      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) return message;
          const existing = message.receipts?.find(
            (entry) => entry.userId === userId,
          );
          const receipts = existing
            ? (message.receipts ?? []).map((entry) =>
                entry.userId !== userId
                  ? entry
                  : {
                      ...entry,
                      deliveredAt: entry.deliveredAt ?? at,
                      readAt: entry.readAt ?? at,
                      listenedAt: entry.listenedAt ?? at,
                    },
              )
            : [
                ...(message.receipts ?? []),
                {
                  userId,
                  deliveredAt: at,
                  readAt: at,
                  listenedAt: at,
                },
              ];
          return { ...message, receipts };
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
    s.on("chat:voice:listened", onVoiceListened);
    s.on("chat:reaction", onReaction);

    return () => {
      s.off("chat:typing", onTyping);
      s.off("chat:message", onNew);
      s.off("share:item", onNew);
      s.off("chat:message:edited", onEdited);
      s.off("chat:message:deleted", onDeleted);
      s.off("chat:receipt", onReceipt);
      s.off("chat:voice:listened", onVoiceListened);
      s.off("chat:reaction", onReaction);
    };
  }, [chatId, me?.id, reactionUserDirectory]);

  // Auto-scroll to bottom logic - always stay at bottom like modern messaging apps
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScroll = useRef(true);

  // Handle scroll events to detect if user is manually scrolling up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    // If user is within 100px of bottom, enable auto-scroll, otherwise disable
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  // Scroll to bottom whenever messages change, but only if shouldAutoScroll is true
  useEffect(() => {
    if (shouldAutoScroll.current && messagesContainerRef.current) {
      // Use instant scroll for new messages to be snappier, smooth scroll can cause jank
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
    // Also scroll to bottom when initial messages load
    if (messages.length > 0 && messagesContainerRef.current) {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages]);

  // Force scroll to bottom when component mounts (initial load)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => clearVoiceRecorder(), []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-white px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ChatAvatar
            name={otherDisplayName}
            online={Boolean(presence?.isOnline)}
          />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[color:var(--wine-900)]">
              {otherDisplayName}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-black/50">
              {typingFrom ? (
                <>
                  <span
                    className="typing-dots"
                    aria-label="Typing"
                    title="Typing"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>Typing</span>
                </>
              ) : (
                <span>{conversationStatus}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="focus-ring grid h-10 w-10 place-items-center rounded-xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "audio");
            }}
            title="Audio call"
            type="button"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            className="focus-ring grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--rose-600)] text-white hover:bg-[color:var(--rose-700)]"
            onClick={() => {
              if (otherUserId) void startCall(otherUserId, "video");
            }}
            title="Video call"
            type="button"
          >
            <Video className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-[#fbf8fa]">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 py-4 scroll-smooth"
        >
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
                  <div className="rounded-full border border-black/5 bg-white px-3 py-1 text-xs font-medium text-black/50">
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
                  className={`group relative flex max-w-[min(88%,42rem)] items-end gap-2 ${
                    mine ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`min-w-0 rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? "rounded-br-md border-[color:var(--rose-600)]/15 bg-[color:var(--rose-600)] text-white"
                        : "rounded-bl-md border-black/5 bg-white text-[color:var(--wine-900)]"
                    }`}
                  >
                    {!mine ? (
                      <div className="mb-1 text-xs font-medium text-black/45">
                        {otherDisplayName}
                      </div>
                    ) : null}

                    {m.deletedAt ? (
                      <span
                        className={
                          mine ? "italic text-white/70" : "italic text-black/45"
                        }
                      >
                        Message deleted
                      </span>
                    ) : editingId === m.id ? (
                      <div className="grid gap-2">
                        <textarea
                          className="focus-ring w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-[color:var(--wine-900)]"
                          rows={3}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft("");
                            }}
                            title="Cancel"
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--rose-600)] text-white hover:bg-[color:var(--rose-700)]"
                            onClick={async () => {
                              const next = editDraft.trim();
                              if (!next) return;
                              await apiFetch(
                                `/api/chats/${chatId}/messages/${m.id}`,
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({ text: next }),
                                  trackLoading: false,
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
                            title="Save"
                            type="button"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : m.type === "share" &&
                      (m.item?.url || m.item?.legacyUrl) ? (
                      <Attachment
                        item={m.item}
                        message={m}
                        meId={me?.id}
                        onVoiceListened={markVoiceListened}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap break-words leading-5">
                        {m.text}
                      </div>
                    )}

                    {reactionGroups.length ? (
                      <div
                        className={`mt-2 max-w-full rounded-xl px-2 py-1.5 ${
                          mine ? "bg-white/15" : "bg-black/[0.03]"
                        }`}
                      >
                        <div className="flex max-w-full flex-wrap gap-1">
                          {reactionGroups.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition ${
                                r.me
                                  ? mine
                                    ? "bg-white/25 text-white"
                                    : "bg-[color:var(--rose-600)]/10 text-[color:var(--rose-700)]"
                                  : mine
                                    ? "bg-white/15 text-white/85"
                                    : "bg-white text-black/65"
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
                      </div>
                    ) : null}

                    <div
                      className={`mt-2 flex items-center gap-1.5 text-[11px] ${
                        mine ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
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
                    <div className="relative flex shrink-0 items-center gap-1 rounded-xl border border-black/5 bg-white p-1 opacity-100 shadow-sm md:opacity-0 md:transition md:group-hover:opacity-100">
                      <button
                        type="button"
                        className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-[color:var(--wine-900)]/65 hover:bg-black/5"
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
                        className={`absolute top-10 z-10 max-w-[220px] flex-wrap items-center gap-1 rounded-xl border border-black/10 bg-white p-1 shadow-lg ${
                          reactionsOpen ? "flex" : "hidden"
                        } ${mine ? "right-0" : "left-0"}`}
                      >
                        {QUICK_REACTIONS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-black/5"
                            onClick={() => emitReaction(m.id, e)}
                            aria-label={`React ${e}`}
                          >
                            <span className="text-sm leading-none">{e}</span>
                          </button>
                        ))}
                      </div>

                      {mine ? (
                        <>
                          {m.type === "text" ? (
                            <button
                              className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-[color:var(--wine-900)]/65 hover:bg-black/5"
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
                            className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-[color:var(--wine-900)]/65 hover:bg-black/5"
                            onClick={async () => {
                              await apiFetch(
                                `/api/chats/${chatId}/messages/${m.id}`,
                                { method: "DELETE", trackLoading: false },
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
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
          {typingFrom ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-black/5 bg-white px-3 py-2 text-sm text-black/55 shadow-sm">
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
          className="border-t border-black/5 bg-white p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!otherUserId || !text.trim() || !me?.id) return;
            const s = ensureSocket();
            const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

            // Optimistically add message to local state immediately
            const optimisticMessage: Msg = {
              id: clientMessageId,
              from: me.id,
              chatId: chatId,
              text: text.trim(),
              createdAt: new Date().toISOString(),
              deletedAt: null,
              editedAt: null,
              reactions: [],
              receipts: [],
              type: "text",
              item: null,
              event: null,
            };
            setMessages((prev) => [...prev, optimisticMessage]);

            s.emit("chat:message", {
              to: otherUserId,
              text: text.trim(),
              clientMessageId,
            });
            setText("");
            // Force scroll to bottom after sending message
            setTimeout(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop =
                  messagesContainerRef.current.scrollHeight;
              }
            }, 50);
            emitTyping(false);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
            <label className="focus-ring grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-black/5 text-[color:var(--wine-900)] transition hover:bg-black/10">
              <Paperclip className="h-3.5 w-3.5" />
              <input
                className="hidden"
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !otherUserId || !me?.id) return;
                  const up = await uploadFile(file, false);
                  const s = ensureSocket();
                  const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

                  // Optimistically add file share to local state immediately
                  const optimisticShare: Msg = {
                    id: clientMessageId,
                    from: me.id,
                    chatId: chatId,
                    item: up.item as ShareItem,
                    createdAt: new Date().toISOString(),
                    deletedAt: null,
                    editedAt: null,
                    reactions: [],
                    receipts: [],
                    type: "share",
                    text: null,
                    event: null,
                  };
                  setMessages((prev) => [...prev, optimisticShare]);

                  s.emit("share:item", {
                    to: otherUserId,
                    item: up.item,
                    clientMessageId,
                  });

                  // Force scroll to bottom after sending file
                  setTimeout(() => {
                    if (messagesContainerRef.current) {
                      messagesContainerRef.current.scrollTop =
                        messagesContainerRef.current.scrollHeight;
                    }
                  }, 50);
                }}
              />
            </label>
            <button
              className={`focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                isRecordingVoice
                  ? "bg-[color:var(--rose-600)] text-white shadow-[0_10px_24px_rgba(198,43,105,0.22)]"
                  : "bg-black/5 text-[color:var(--wine-900)] hover:bg-black/10"
              } ${isSendingVoice ? "cursor-wait opacity-70" : ""}`}
              disabled={isSendingVoice}
              onClick={() => {
                if (isRecordingVoice) stopVoiceRecording();
                else void startVoiceRecording();
              }}
              type="button"
              title={
                isRecordingVoice ? "Stop recording" : "Record voice message"
              }
            >
              {isSendingVoice ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : isRecordingVoice ? (
                <Square className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              {isRecordingVoice ? (
                <div className="mb-1 px-1 text-xs font-medium text-[color:var(--rose-700)]">
                  Recording {formatElapsed(voiceDurationMs)}
                </div>
              ) : null}
              <input
                className="focus-ring w-full rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm transition-all duration-200 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                placeholder={
                  isRecordingVoice
                    ? "Tap stop to send voice message"
                    : "Type a message..."
                }
                value={text}
                disabled={isRecordingVoice}
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
              className="focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              type="submit"
              disabled={isRecordingVoice || !text.trim()}
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
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

function ChatAvatar({ name, online }: { name: string; online: boolean }) {
  const initials =
    name
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/5 bg-[color:var(--peach-200)]/55 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--rose-700)]">
      {initials}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
          online ? "bg-emerald-500" : "bg-black/25"
        }`}
      />
    </div>
  );
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

function Attachment({
  item,
  message,
  meId,
  onVoiceListened,
}: {
  item: ShareItem;
  message?: Msg;
  meId?: string;
  onVoiceListened?: (messageId: string) => void;
}) {
  const kind = String(item.kind ?? "file");
  const mime = String(item.mime ?? item.contentType ?? "");
  const url = toAbsoluteUrl(String(item.url ?? item.legacyUrl ?? ""));
  const name = String(item.originalName ?? item.filename ?? "Attachment");
  const size = typeof item.size === "number" ? item.size : undefined;
  const meta = asRecord(item.meta);
  const isVoiceNote = meta?.voiceNote === true;
  const voiceDurationMs =
    typeof meta?.durationMs === "number" ? meta.durationMs : undefined;

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
      <div className="grid gap-2 rounded-[20px] bg-white/55 px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--wine-900)]/55">
          <span>{isVoiceNote ? "Voice message" : "Audio attachment"}</span>
          <span className="tabular-nums">
            {voiceDurationMs
              ? formatElapsed(voiceDurationMs)
              : size
                ? formatBytes(size)
                : ""}
          </span>
        </div>
        <audio
          src={url}
          controls
          className="w-full"
          onPlay={() => {
            if (!isVoiceNote || !message?.id || !meId || message.from === meId)
              return;
            onVoiceListened?.(message.id);
          }}
        />
        <a
          className="text-[10px] underline text-black/55"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {isVoiceNote ? "Open original recording" : name}
        </a>
        {isVoiceNote && message && message.from === meId ? (
          <div className="text-[10px] text-black/55">
            {(() => {
              const status = voiceListenStatus(message, meId);
              if (status === "listened") return "Played";
              if (status === "read") return "Seen";
              if (status === "delivered") return "Delivered";
              return "Sent";
            })()}
          </div>
        ) : null}
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

function voiceListenStatus(m: Msg, meId: string) {
  const otherReceipt = m.receipts?.find((entry) => entry.userId !== meId);
  if (!otherReceipt) return "sent" as const;
  if (otherReceipt.listenedAt) return "listened" as const;
  if (otherReceipt.readAt) return "read" as const;
  if (otherReceipt.deliveredAt) return "delivered" as const;
  return "sent" as const;
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
