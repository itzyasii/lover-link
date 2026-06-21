"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
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
  Phone,
  Send,
  Square,
  Video,
} from "lucide-react";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { useCall } from "@/components/call/CallProvider";
import { formatLastSeen } from "@/lib/time";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  Chat,
  ChatMember,
  Msg,
  ReactionGroup,
  ReactionUser,
  ShareItem,
} from "@/types/chat";
import {
  RomanticImageAttachment,
  RomanticVideoAttachment,
} from "@/components/chat/MediaAttachments";

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
      (
        ack: {
          ok: boolean;
          action?: "added" | "removed";
          user?: ReactionUser;
        } & { error?: string },
      ) => {
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
    import("@/lib/users").then(async ({ resolveUserLabels, getCachedUser }) => {
      await resolveUserLabels([otherUserId]);
      const u = getCachedUser(otherUserId);
      if (u?.lastSeenAt) {
        setOtherUserLastSeen(u.lastSeenAt);
      }
    });
  }, [otherUserId]);

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
        const isOnline = data.users.includes(otherUserId);
        setIsOtherUserOnline(isOnline);
        if (!isOnline) {
          // They just went offline, fallback to "just now" or fetch real DB value
          setOtherUserLastSeen(new Date().toISOString());
        }
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

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const isFetchingMoreRef = useRef(false);
  const { ref: loadMoreRef, inView } = useInView();

  useEffect(() => {
    if (!chatId || messages.length > 0) return; // Only fetch once if messages aren't already loaded
    void apiFetch<{ ok: true; messages: Msg[]; nextCursor: string | null }>(
      `/api/chats/${chatId}/messages?limit=50`,
    ).then((data) => {
      if (data.ok) {
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
        markMessagesRead(data.messages);
      }
    });
  }, [chatId, messages.length, markMessagesRead]);

  const fetchMore = useCallback(() => {
    if (!nextCursor || isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);
    const container = messagesContainerRef.current;
    const scrollHeightBefore = container?.scrollHeight ?? 0;
    const scrollTopBefore = container?.scrollTop ?? 0;
    apiFetch<{ ok: true; messages: Msg[]; nextCursor: string | null }>(
      `/api/chats/${chatId}/messages?limit=50&before=${nextCursor}`,
    ).then((data) => {
      if (data.ok) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = data.messages.filter(m => !existingIds.has(m.id));
          return [...newMessages, ...prev];
        });
        setNextCursor(data.nextCursor);
        // Restore scroll position so it doesn't jump to top after prepend
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - scrollHeightBefore + scrollTopBefore;
          }
        });
      }
      setIsFetchingMore(false);
      isFetchingMoreRef.current = false;
    });
  }, [nextCursor, chatId]);

  useEffect(() => {
    if (inView) {
      fetchMore();
    }
  }, [inView, fetchMore]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Simple scroll-to-bottom button logic
      const isScrolledToBottom =
        container.scrollHeight - container.clientHeight <=
        container.scrollTop + 1;
      // You can add a state here to show/hide a "scroll to bottom" button
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Only auto-scroll to bottom when NEW messages are appended (not when loading older ones)
  const prevMessageCountRef = useRef(0);
  const prevLastIdRef = useRef("");
  useEffect(() => {
    const count = messages.length;
    const lastId = messages[count - 1]?.id ?? "";
    const wasAtBottom = (() => {
      const c = messagesContainerRef.current;
      if (!c) return true;
      return c.scrollHeight - c.clientHeight <= c.scrollTop + 150;
    })();
    // Only scroll to bottom if: a new message was appended (last id changed) AND we were near bottom
    if (count > prevMessageCountRef.current && lastId !== prevLastIdRef.current && wasAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = count;
    prevLastIdRef.current = lastId;
  }, [messages]);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    const onTyping = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      if (r.chatId !== chatId) return;
      const from = r.from == null ? null : String(r.from);
      if (!from) return;
      setTypingFrom(from);
      setTimeout(() => setTypingFrom(null), 3000);
    };

    const normalizeMsg = (msg: Record<string, unknown>): Msg => ({
      id: msg.id == null ? "" : String(msg.id),
      from: msg.from == null ? "" : String(msg.from),
      chatId: msg.chatId == null ? "" : String(msg.chatId),
      text: msg.text == null ? null : String(msg.text),
      item: msg.item == null ? null : (msg.item as ShareItem),
      event: normalizeEvent(msg.event),
      type:
        msg.type === "text" || msg.type === "share" || msg.type === "event"
          ? msg.type
          : "text",
      clientMessageId: msg.clientMessageId == null ? undefined : String(msg.clientMessageId),
      createdAt:
        msg.createdAt == null
          ? new Date().toISOString()
          : String(msg.createdAt),
      editedAt: msg.editedAt == null ? null : String(msg.editedAt),
      deletedAt: msg.deletedAt == null ? null : String(msg.deletedAt),
      reactions: normalizeReactions(msg.reactions),
      receipts: Array.isArray(msg.receipts) ? msg.receipts : [],
      linkPreview: msg.linkPreview as Msg["linkPreview"],
    });

    const upsertMessage = (normalized: Msg) => {
      setMessages((prev) => {
        // Dedup by real id OR by clientMessageId (replaces optimistic)
        const existingIdx = prev.findIndex(
          (m) =>
            m.id === normalized.id ||
            (normalized.clientMessageId && m.id === normalized.clientMessageId),
        );
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = normalized;
          return updated;
        }
        return [...prev, normalized];
      });
    };

    const onMessage = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const msg = asRecord(r.message);
      if (!msg) return;
      if (msg.chatId !== chatId) return;
      const normalized = normalizeMsg(msg);
      upsertMessage(normalized);
      markMessagesRead([normalized]);
    };

    const onShareItem = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const msg = asRecord(r.message);
      if (!msg) return;
      if (msg.chatId !== chatId) return;
      const normalized = normalizeMsg(msg);
      upsertMessage(normalized);
      markMessagesRead([normalized]);
    };

    const onMessageEdit = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageId = r.messageId == null ? null : String(r.messageId);
      const text = r.text == null ? null : String(r.text);
      const editedAt =
        r.editedAt == null ? new Date().toISOString() : String(r.editedAt);
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text, editedAt } : m)),
      );
    };

    const onMessageDelete = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageId = r.messageId == null ? null : String(r.messageId);
      const deletedAt =
        r.deletedAt == null ? new Date().toISOString() : String(r.deletedAt);
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, text: null, deletedAt } : m,
        ),
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

    const onRead = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageIds = Array.isArray(r.messageIds) ? r.messageIds : [];
      const userId = r.userId == null ? null : String(r.userId);
      const readAt =
        r.readAt == null ? new Date().toISOString() : String(r.readAt);
      if (!userId || !messageIds.length) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!messageIds.includes(m.id)) return m;
          const receipts = m.receipts ?? [];
          const existing = receipts.find((entry) => entry.userId === userId);
          if (existing) {
            return {
              ...m,
              receipts: receipts.map((entry) =>
                entry.userId === userId
                  ? { ...entry, readAt: entry.readAt ?? readAt }
                  : entry,
              ),
            };
          }
          return {
            ...m,
            receipts: [...receipts, { userId, readAt }],
          };
        }),
      );
    };

    const onDelivered = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageIds = Array.isArray(r.messageIds) ? r.messageIds : [];
      const userId = r.userId == null ? null : String(r.userId);
      const deliveredAt =
        r.deliveredAt == null
          ? new Date().toISOString()
          : String(r.deliveredAt);
      if (!userId || !messageIds.length) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (!messageIds.includes(m.id)) return m;
          const receipts = m.receipts ?? [];
          const existing = receipts.find((entry) => entry.userId === userId);
          if (existing) {
            return {
              ...m,
              receipts: receipts.map((entry) =>
                entry.userId === userId
                  ? { ...entry, deliveredAt: entry.deliveredAt ?? deliveredAt }
                  : entry,
              ),
            };
          }
          return {
            ...m,
            receipts: [...receipts, { userId, deliveredAt }],
          };
        }),
      );
    };

    const onVoiceListened = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const messageId = r.messageId == null ? null : String(r.messageId);
      const userId = r.userId == null ? null : String(r.userId);
      const listenedAt =
        r.listenedAt == null ? new Date().toISOString() : String(r.listenedAt);
      if (!userId || !messageId) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const receipts = m.receipts ?? [];
          const existing = receipts.find((entry) => entry.userId === userId);
          if (existing) {
            return {
              ...m,
              receipts: receipts.map((entry) =>
                entry.userId === userId
                  ? { ...entry, listenedAt: entry.listenedAt ?? listenedAt }
                  : entry,
              ),
            };
          }
          return {
            ...m,
            receipts: [...receipts, { userId, listenedAt }],
          };
        }),
      );
    };

    s.on("chat:typing", onTyping);
    s.on("chat:message", onMessage);
    s.on("share:item", onShareItem);
    s.on("chat:edit", onMessageEdit);
    s.on("chat:message:deleted", onMessageDelete);
    s.on("chat:react", onReaction);
    s.on("chat:read", onRead);
    s.on("chat:delivered", onDelivered);
    s.on("chat:voice:listened", onVoiceListened);

    return () => {
      s.off("chat:typing", onTyping);
      s.off("chat:message", onMessage);
      s.off("share:item", onShareItem);
      s.off("chat:edit", onMessageEdit);
      s.off("chat:message:deleted", onMessageDelete);
      s.off("chat:react", onReaction);
      s.off("chat:read", onRead);
      s.off("chat:delivered", onDelivered);
      s.off("chat:voice:listened", onVoiceListened);
    };
  }, [chatId, markMessagesRead, reactionUserDirectory]);

  const sendMessage = () => {
    if (!text.trim()) return;
    if (!otherUserId) return;
    
    const s = ensureSocket();
    const clientMessageId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    
    const optimisticMessage: Msg = {
      id: clientMessageId,
      from: me!.id,
      chatId: chatId,
      text: text.trim(),
      item: null,
      type: "text",
      createdAt: new Date().toISOString(),
      deletedAt: null,
      editedAt: null,
      reactions: [],
      receipts: [],
      event: null,
    };
    
    setMessages((prev) => [...prev, optimisticMessage]);
    s.emit("chat:message", { to: otherUserId, text: text.trim(), clientMessageId });
    
    setText("");
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
      emitTyping(false);
    }
    
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop =
          messagesContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    setText(e.currentTarget.value);
    if (!typingTimer.current) {
      emitTyping(true);
    } else {
      clearTimeout(typingTimer.current);
    }
    typingTimer.current = window.setTimeout(() => {
      emitTyping(false);
      typingTimer.current = null;
    }, 3000);
  };

  // const reactionGroups = useMemo(
  //   () => (m: Msg) =>
  //     groupReactions(m.reactions ?? [], me?.id ?? "", reactionUserLabels),
  //   [me?.id, reactionUserLabels],
  // );

  const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

  const Attachment = ({
    item,
    message,
    meId,
    onVoiceListened,
  }: {
    item: unknown;
    message: Msg;
    meId: string | undefined;
    onVoiceListened: (id: string) => void;
  }) => {
    const r = asRecord(item);
    if (!r) return null;
    const kind = typeof r.kind === "string" ? r.kind : null;
    const url = typeof r.url === "string" ? r.url : "";
    const name = typeof r.name === "string" ? r.name : "attachment";
    const size = typeof r.size === "number" ? r.size : undefined;
    const meta = asRecord(r.meta);
    const isVoiceNote = meta?.voiceNote === true;
    const durationMs =
      typeof meta?.durationMs === "number" ? meta.durationMs : undefined;

    if (kind === "image" && url) {
      return <RomanticImageAttachment url={url} name={name} size={size} />;
    }
    if (kind === "video" && url) {
      return <RomanticVideoAttachment url={url} name={name} size={size} />;
    }
    if (kind === "audio" && url && isVoiceNote) {
      return (
        <VoiceNotePlayer
          url={url}
          durationMs={durationMs}
          listened={
            message.from !== meId &&
            !!message.receipts?.find((r) => r.userId === meId)?.listenedAt
          }
          onListened={() => onVoiceListened(message.id)}
        />
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-black/5 px-4 py-3">
        {kind === "file" ? (
          <FileText className="h-6 w-6 shrink-0 text-gray-500" />
        ) : (
          <FileIcon className="h-6 w-6 shrink-0 text-gray-500" />
        )}
        <div className="grow">
          <div className="font-semibold">{name}</div>
          {size ? (
            <div className="text-xs text-gray-500">
              {(size / 1024 / 1024).toFixed(2)} MB
            </div>
          ) : null}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white hover:bg-gray-100"
        >
          <Download className="h-5 w-5" />
        </a>
      </div>
    );
  };

  const ReceiptMark = ({
    m,
    otherUserId,
  }: {
    m: Msg;
    otherUserId: string | null;
  }) => {
    if (!otherUserId)
      return <CheckCheck className="h-4 w-4 text-[--sky-500]" />;
    const receipt = m.receipts?.find((r) => r.userId === otherUserId);
    if (receipt?.readAt)
      return <CheckCheck className="h-4 w-4 text-[--sky-500]" />;
    if (receipt?.deliveredAt)
      return <CheckCheck className="h-4 w-4 text-gray-400" />;
    return <Check className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/10 p-4">
        <div className="grow">
          <h1 className="font-bold">{otherDisplayName}</h1>
          <p className="text-xs text-gray-500">{conversationStatus}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="focus-ring grid h-10 w-10 place-items-center rounded-full"
            onClick={() => startCall(otherUserId!, "audio")}
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="focus-ring grid h-10 w-10 place-items-center rounded-full"
            onClick={() => startCall(otherUserId!, "video")}
          >
            <Video className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        ref={messagesContainerRef}
        className="grow space-y-6 overflow-y-auto p-4"
      >
        {messages.length > 0 && nextCursor && (
          <div ref={loadMoreRef} className="py-2 flex justify-center">
            {isFetchingMore ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-gray-500" />
            ) : null}
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.from === me?.id;
          const prevMessage = i > 0 ? messages[i - 1] : null;
          
          const prevDate = prevMessage ? new Date(prevMessage.createdAt).toLocaleDateString() : null;
          const currentDate = new Date(m.createdAt).toLocaleDateString();
          const showDateSeparator = currentDate !== prevDate;
          
          const hideName = !showDateSeparator && !!prevMessage && prevMessage.from === m.from;
          const isLast = i === messages.length - 1 || i === messages.length - 2;

          const reactionGroups = groupReactions(
            m.reactions ?? [],
            me?.id ?? "",
            reactionUserLabels,
          );
          return (
            <Fragment key={m.id}>
              {showDateSeparator && (
                <div className="flex justify-center my-4">
                  <span className="text-xs font-medium bg-black/5 text-gray-500 px-3 py-1 rounded-full">
                    {currentDate === new Date().toLocaleDateString() ? "Today" : new Date(currentDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
              <MessageBubble
                m={m}
                mine={mine}
                meId={me?.id}
                chatId={chatId}
                otherUserId={otherUserId}
                otherDisplayName={otherDisplayName}
                editingId={editingId}
                editDraft={editDraft}
                setEditingId={setEditingId}
                setEditDraft={setEditDraft}
                openReactionFor={openReactionFor}
                setOpenReactionFor={setOpenReactionFor}
                emitReaction={emitReaction}
                reactionGroups={reactionGroups}
                reactionUserLabels={reactionUserLabels}
                formatReactionUsers={formatReactionUsers}
                setMessages={setMessages}
                markVoiceListened={markVoiceListened}
                Attachment={Attachment}
                ReceiptMark={ReceiptMark}
                QUICK_REACTIONS={QUICK_REACTIONS}
                hideName={hideName}
                isLast={isLast}
              />
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <footer className="shrink-0 border-t border-black/10 p-4">
        <div className="relative">
          {isRecordingVoice || isSendingVoice ? (
            <div className="flex h-[h-18] items-center justify-between gap-4 rounded-2xl bg-white px-4">
              {isSendingVoice ? (
                <>
                  <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-gray-500" />
                  <div className="grow text-center text-sm font-semibold text-gray-600">
                    Sending voice message...
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500 text-white"
                    onClick={stopVoiceRecording}
                  >
                    <Square className="h-5 w-5" />
                  </button>
                  <div className="flex grow items-center justify-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-red-500 [animation-duration:1.5s]" />
                    <div className="font-mono text-sm font-semibold text-gray-700">
                      {formatElapsed(voiceDurationMs)}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <textarea
              rows={1}
              className="w-full resize-none rounded-2xl border border-transparent bg-gray-100 px-4 py-3 pr-24 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-0"
              placeholder="Type a message..."
              value={text}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
            />
          )}

          <div className="absolute bottom-1 right-1 top-1 flex items-center">
            <button
              type="button"
              className="focus-ring grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:text-gray-800"
              onClick={startVoiceRecording}
            >
              <Mic className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="focus-ring grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:text-gray-800"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="focus-ring grid h-10 w-10 place-items-center rounded-full bg-rose-500 text-white disabled:opacity-50"
              onClick={sendMessage}
              disabled={!text.trim()}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
