"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Phone,
  Video,
  ArrowLeft,
  Smile,
  Mic,
  Heart,
  Sparkles,
  Check,
  CheckCheck,
  Headphones,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useTypingStore } from "@/stores/typing";
import { useFriendsStore } from "@/stores/friends";
import { useCall } from "@/components/call/CallProvider";
import { useToastStore } from "@/stores/toast";
import { useCallsStore } from "@/stores/calls";
import { apiFetch, apiFormData, apiFormDataWithProgress } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { env } from "@/lib/env";
import { AudioRecorderUI } from "@/components/chat/AudioRecorderUI";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { formatTime } from "@/lib/utils";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { cn } from "@/lib/utils";
import { usePresenceStore } from "@/stores/presence";
import Image from "next/image";

type MessageType = "text" | "share" | "event";
type EventKind = "call_started" | "call_ended";

interface ShareItem {
  kind: "file" | "image" | "video" | "audio";
  url: string;
  originalName?: string;
  mime?: string;
  size?: number;
  meta?: Record<string, unknown>;
}

interface EventItem {
  kind: EventKind;
  media?: "audio" | "video";
}

interface ReplyToMessage {
  id: string;
  // Server only requires id for REST API calls - other fields are populated server-side
  text?: string | null;
  from?: string;
  fromName?: string;
  type?: "text" | "share" | "event";
  item?: {
    kind?: "file" | "image" | "video" | "audio";
    url?: string;
    originalName?: string;
    mime?: string;
    size?: number;
    meta?: Record<string, unknown>;
  };
}

interface Message {
  id: string;
  chatId: string;
  from: string;
  type: MessageType;
  clientMessageId?: string;
  text?: string | null;
  item?: ShareItem;
  event?: EventItem;
  reactions: Array<{
    emoji: string;
    userId: string;
    createdAt: string;
  }>;
  likes?: Array<{ userId: string; createdAt: string }>;
  receipts: Array<{
    userId: string;
    deliveredAt?: string;
    readAt?: string;
    listenedAt?: string;
  }>;
  linkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    url: string;
  };
  editedAt?: string;
  deletedAt?: string;
  replyTo?: ReplyToMessage;
  createdAt: string;
  updatedAt: string;
  uploadProgress?: number;
  uploadFailed?: boolean;
}

type ShareItemLike = ShareItem | NonNullable<ReplyToMessage["item"]>;

const normalizeShareItem = (item?: ShareItemLike): ShareItem | undefined => {
  if (!item) return item;
  const inferredKind = item.mime?.startsWith("audio/")
    ? "audio"
    : item.mime?.startsWith("image/")
      ? "image"
      : item.mime?.startsWith("video/")
        ? "video"
        : item.kind || "file";
  return { ...item, kind: inferredKind, url: item.url || "" };
};

type Receipt = Message["receipts"][number];

const normalizeReceiptDate = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "$date" in value) {
    const date = (value as { $date?: unknown }).$date;
    return typeof date === "string" ? date : undefined;
  }
  return undefined;
};

const normalizeReceipts = (receipts: unknown[] = []): Receipt[] =>
  receipts.map((receipt) => {
    const value = receipt as {
      userId: string | { $oid?: string };
      deliveredAt?: unknown;
      readAt?: unknown;
      listenedAt?: unknown;
    };
    return {
      userId:
        typeof value.userId === "object"
          ? value.userId.$oid || ""
          : value.userId,
      deliveredAt: normalizeReceiptDate(value.deliveredAt),
      readAt: normalizeReceiptDate(value.readAt),
      listenedAt: normalizeReceiptDate(value.listenedAt),
    };
  });

interface ChatDetails {
  id: string;
  type: "dm";
  members: {
    id: string;
    email: string;
    username: string;
    avatar?: string;
    isOnline?: boolean;
  }[];
  messages?: Message[];
  isPinned?: boolean;
  isMuted?: boolean;
  updatedAt: string;
  createdAt: string;
}

// Floating Hearts Animation Component
const FloatingHeart = ({ delay, x }: { delay: number; x: number }) => (
  <motion.div
    initial={{ y: "100vh", opacity: 0, scale: 0 }}
    animate={{
      y: "-100vh",
      opacity: [0, 1, 0.8, 0],
      scale: [0, 1.2, 1, 0.5],
      rotate: [0, 15, -15, 0],
      x: [x, x + 30, x - 30, x],
    }}
    transition={{
      duration: 8,
      delay,
      repeat: Infinity,
      ease: "linear",
    }}
    className="absolute bottom-0 text-rose-400/30 pointer-events-none"
    style={{ left: `${x}%` }}
  >
    <Heart className="w-6 h-6 fill-current" />
  </motion.div>
);

// Sparkle component for special messages
const MessageSparkles = () => (
  <>
    <motion.div
      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
      className="absolute -top-1 -left-1"
    >
      <Sparkles className="w-4 h-4 text-yellow-400" />
    </motion.div>
    <motion.div
      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
      className="absolute -top-1 -right-1"
    >
      <Sparkles className="w-4 h-4 text-yellow-400" />
    </motion.div>
  </>
);

const burstParticles = [
  { x: -72, y: -92, rotate: -28, delay: 0 },
  { x: 66, y: -118, rotate: 22, delay: 0.04 },
  { x: -112, y: -36, rotate: -48, delay: 0.08 },
  { x: 108, y: -42, rotate: 44, delay: 0.12 },
  { x: 0, y: -142, rotate: 0, delay: 0.06 },
] as const;

/** A short, GPU-friendly celebration: five fixed particles, no per-tap asset loading. */
function RomanticBurst({
  kind,
  x,
  y,
}: {
  kind: "heart" | "kiss";
  x: number;
  y: number;
}) {
  const reduceMotion = useReducedMotion();
  const isHeart = kind === "heart";
  const glyph = isHeart ? "♥" : "💋";

  return (
    <motion.div
      className="fixed pointer-events-none z-100 -translate-x-1/2 -translate-y-1/2 will-change-transform"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.45 }}
      animate={
        reduceMotion
          ? { opacity: [0, 1, 0], scale: [0.7, 1.1, 1] }
          : {
              y: isHeart ? -290 : -250,
              opacity: [0, 1, 1, 0],
              scale: [0.45, 1.2, 1.35, 0.85],
              rotate: [-8, 8, -5, 0],
            }
      }
      transition={{ duration: reduceMotion ? 0.55 : 1.75, ease: "easeOut" }}
    >
      <div
        className={cn(
          "relative grid h-20 w-20 place-items-center rounded-full border border-white/50 shadow-2xl backdrop-blur-sm",
          isHeart
            ? "bg-linear-to-br from-rose-400 via-pink-500 to-fuchsia-500"
            : "bg-linear-to-br from-pink-300 via-rose-400 to-red-500",
        )}
      >
        <span
          className={cn(
            "drop-shadow-md",
            isHeart ? "text-5xl text-white" : "text-4xl",
          )}
        >
          {glyph}
        </span>
        {!reduceMotion &&
          burstParticles.map((particle, index) => (
            <motion.span
              key={index}
              className="absolute text-lg drop-shadow-sm"
              initial={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0.3, 1, 0.55],
                x: particle.x,
                y: particle.y,
                rotate: particle.rotate,
              }}
              transition={{
                duration: 0.9,
                delay: particle.delay,
                ease: "easeOut",
              }}
            >
              {index === 4 ? "✦" : index % 2 === 0 ? "♥" : "✨"}
            </motion.span>
          ))}
      </div>
    </motion.div>
  );
}

export default function ChatRoomPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { markAsRead, chats, updateChat } = useChatsStore();
  const { blockedUsers } = useFriendsStore();
  const { addToast } = useToastStore();
  const { startTyping, stopTyping } = useTypingStore();
  const { initiateCall } = useCall();
  const queryClient = useQueryClient();

  const [hearts] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      delay: i * 1.5,
      x: Math.random() * 100,
    })),
  );
  const [messageHearts, setMessageHearts] = useState<
    { id: string; x: number; y: number }[]
  >([]);
  const [messageKisses, setMessageKisses] = useState<
    { id: string; x: number; y: number }[]
  >([]);
  const [showLoveReaction, setShowLoveReaction] = useState<string | null>(null);
  // Use React Query cache for messages to work with realtime updates (matches RealtimeListener architecture)
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", chatId],
    queryFn: async () => {
      const limit = 50;
      const url = `/api/chats/${chatId}/messages?limit=${limit}`;

      const response = await apiFetch<{
        ok: boolean;
        messages: Message[];
        nextCursor: string | null;
      }>(url);

      if (response.ok) {
        // Normalize MongoDB ObjectIds and dates
        const normalizedMessages = response.messages.map((msg) => {
          // Normalize createdAt properly
          let normalizedCreatedAt: string;
          if (typeof msg.createdAt === "string") {
            normalizedCreatedAt = msg.createdAt;
          } else if (
            typeof msg.createdAt === "object" &&
            msg.createdAt !== null
          ) {
            // Handle MongoDB { $date: "..." } format
            const dateObj = msg.createdAt as { $date?: string };
            normalizedCreatedAt = dateObj.$date || new Date().toISOString();
          } else {
            normalizedCreatedAt = new Date().toISOString();
          }

          // Normalize updatedAt similarly
          let normalizedUpdatedAt: string;
          if (typeof msg.updatedAt === "string") {
            normalizedUpdatedAt = msg.updatedAt;
          } else if (
            typeof msg.updatedAt === "object" &&
            msg.updatedAt !== null
          ) {
            const dateObj = msg.updatedAt as { $date?: string };
            normalizedUpdatedAt = dateObj.$date || new Date().toISOString();
          } else {
            normalizedUpdatedAt = new Date().toISOString();
          }

          return {
            ...msg,
            item: normalizeShareItem(msg.item),
            replyTo: msg.replyTo
              ? { ...msg.replyTo, item: normalizeShareItem(msg.replyTo.item) }
              : msg.replyTo,
            id:
              (msg as unknown as { _id?: { $oid: string } })._id?.$oid ||
              msg.id,
            chatId:
              (msg as unknown as { chatId?: { $oid: string } }).chatId?.$oid ||
              msg.chatId,
            from:
              (msg as unknown as { from?: { $oid: string } }).from?.$oid ||
              msg.from,
            likes: msg.likes || [],
            receipts: normalizeReceipts(msg.receipts),
            createdAt: normalizedCreatedAt,
            updatedAt: normalizedUpdatedAt,
          };
        });

        setNextCursor(response.nextCursor);
        return normalizedMessages;
      }
      return [];
    },
    enabled: !!chatId,
    // Keep cached data fresh
    staleTime: 0,
    // Never garbage collect while user is in this chat
    gcTime: Infinity,
  });

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // Memoized handlers for audio recorder to prevent component remounts
  const handleCancelRecording = useCallback(() => {
    setIsRecording(false);
    wasRecordingBeforeCall.current = false;
  }, []);
  const [editText, setEditText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMessageActions, setActiveMessageActions] = useState<
    string | null
  >(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  // Keep the live preview and its captured pixels in the exact same orientation.
  const [isMirroredCamera, setIsMirroredCamera] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRecorderPauseRef = useRef<(() => void) | null>(null);
  const wasRecordingBeforeCall = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const messageActionsRef = useRef<HTMLDivElement>(null);
  const lastHeartEmitRef = useRef<number>(0);
  const lastKissEmitRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      // Close message actions if clicking outside
      if (
        messageActionsRef.current &&
        !messageActionsRef.current.contains(event.target as Node)
      ) {
        setActiveMessageActions(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Handle long press for mobile
  const handleMessageTouchStart = (messageId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setActiveMessageActions(messageId);
    }, 500); // 500ms long press
  };

  const handleMessageTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  // Block check as required by CHATS_API.md
  const isBlockedEitherWay = (userId1: string, userId2: string): boolean => {
    return blockedUsers.some((b) => b.userId === userId2);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newMessage, setNewMessage] = useState("");
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );

  // Mark chat as read whenever we enter it
  useEffect(() => {
    if (chatId) {
      markAsRead(chatId);
    }
  }, [chatId, markAsRead]);

  // Load more messages when scrolling up (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);

    const limit = 50;
    const url = `/api/chats/${chatId}/messages?limit=${limit}&cursor=${nextCursor}`;

    try {
      const response = await apiFetch<{
        ok: boolean;
        messages: Message[];
        nextCursor: string | null;
      }>(url);

      if (response.ok) {
        // Normalize MongoDB ObjectIds and dates for new page
        const normalizedMessages = response.messages.map((msg) => {
          // Normalize createdAt properly
          let normalizedCreatedAt: string;
          if (typeof msg.createdAt === "string") {
            normalizedCreatedAt = msg.createdAt;
          } else if (
            typeof msg.createdAt === "object" &&
            msg.createdAt !== null
          ) {
            // Handle MongoDB { $date: "..." } format
            const dateObj = msg.createdAt as { $date?: string };
            normalizedCreatedAt = dateObj.$date || new Date().toISOString();
          } else {
            normalizedCreatedAt = new Date().toISOString();
          }

          // Normalize updatedAt similarly
          let normalizedUpdatedAt: string;
          if (typeof msg.updatedAt === "string") {
            normalizedUpdatedAt = msg.updatedAt;
          } else if (
            typeof msg.updatedAt === "object" &&
            msg.updatedAt !== null
          ) {
            const dateObj = msg.updatedAt as { $date?: string };
            normalizedUpdatedAt = dateObj.$date || new Date().toISOString();
          } else {
            normalizedUpdatedAt = new Date().toISOString();
          }

          return {
            ...msg,
            item: normalizeShareItem(msg.item),
            replyTo: msg.replyTo
              ? { ...msg.replyTo, item: normalizeShareItem(msg.replyTo.item) }
              : msg.replyTo,
            id:
              (msg as unknown as { _id?: { $oid: string } })._id?.$oid ||
              msg.id,
            chatId:
              (msg as unknown as { chatId?: { $oid: string } }).chatId?.$oid ||
              msg.chatId,
            from:
              (msg as unknown as { from?: { $oid: string } }).from?.$oid ||
              msg.from,
            likes: msg.likes || [],
            receipts: normalizeReceipts(msg.receipts),
            createdAt: normalizedCreatedAt,
            updatedAt: normalizedUpdatedAt,
          };
        });

        // Update React Query cache with older messages (prepend them)
        queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
          if (!oldData || !Array.isArray(oldData)) return normalizedMessages;

          const existingIds = new Set(oldData.map((m) => m.id));
          const uniqueNewMessages = normalizedMessages.filter(
            (msg) => !existingIds.has(msg.id),
          );

          return [...uniqueNewMessages, ...oldData];
        });

        setNextCursor(response.nextCursor);
      }
    } catch (error) {
      console.error("[Chat] Failed to load more messages:", error);
    }

    setIsLoadingMore(false);
  }, [nextCursor, isLoadingMore, chatId, queryClient]);

  // Edit message (CHATS_API.md: PATCH /chats/:chatId/messages/:messageId)
  const editMessageMutation = useMutation({
    mutationFn: async ({
      messageId,
      text,
    }: {
      messageId: string;
      text: string;
    }) => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/messages/${messageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ text }),
        },
      );
      if (!response.ok) throw new Error("Failed to edit message");
      return { messageId, text };
    },
    onSuccess: ({ messageId, text }) => {
      // Update React Query cache directly instead of invalidating
      queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((msg) =>
          msg.id === messageId
            ? { ...msg, text, editedAt: new Date().toISOString() }
            : msg,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      setEditingMessageId(null);
      setEditText("");
      addToast("Message updated", "success");
    },
    onError: () => {
      addToast("Failed to edit message", "error");
    },
  });

  // Delete message (CHATS_API.md: DELETE /chats/:chatId/messages/:messageId)
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/messages/${messageId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete message");
      return response;
    },
    onSuccess: (_, messageId) => {
      // Update React Query cache directly instead of invalidating
      queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        return oldData.map((msg) =>
          msg.id === messageId
            ? { ...msg, deletedAt: new Date().toISOString() }
            : msg,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      addToast("Message deleted", "success");
    },
    onError: () => {
      addToast("Failed to delete message", "error");
    },
  });

  // Pin chat (CHATS_API.md: POST /chats/:chatId/pin)
  const pinChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/pin`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Failed to pin chat");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      updateChat(chatId, { isPinned: true });
      addToast("Chat pinned", "success");
    },
    onError: () => addToast("Failed to pin chat", "error"),
  });

  // Unpin chat (CHATS_API.md: DELETE /chats/:chatId/pin)
  const unpinChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/pin`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Failed to unpin chat");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      updateChat(chatId, { isPinned: false });
      addToast("Chat unpinned", "success");
    },
    onError: () => addToast("Failed to unpin chat", "error"),
  });

  // Mute chat (CHATS_API.md: POST /chats/:chatId/mute)
  const muteChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/mute`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Failed to mute chat");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      updateChat(chatId, { isMuted: true });
      addToast("Chat muted", "success");
    },
    onError: () => addToast("Failed to mute chat", "error"),
  });

  // Unmute chat (CHATS_API.md: DELETE /chats/:chatId/mute)
  const unmuteChatMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/mute`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Failed to unmute chat");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      updateChat(chatId, { isMuted: false });
      addToast("Chat unmuted", "success");
    },
    onError: () => addToast("Failed to unmute chat", "error"),
  });

  // Handle scroll to load more messages
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop } = containerRef.current;
      if (scrollTop < 100 && nextCursor && !isLoadingMore) {
        loadMoreMessages();
      }
    }
  }, [nextCursor, isLoadingMore, loadMoreMessages]);

  const { data: chat, isLoading } = useQuery<ChatDetails>({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      const response = await apiFetch<{ ok: boolean; chat: ChatDetails }>(
        `/api/chats/${chatId}`,
      );
      if (response.ok) {
        // Normalize MongoDB ObjectIds (convert { $oid: "..." } to string)
        const normalizedChat = { ...response.chat };

        // Normalize messages - convert all ObjectId fields to strings
        if (normalizedChat.messages) {
          normalizedChat.messages = normalizedChat.messages.map(
            (msg: Message) => ({
              ...msg,
              id:
                (msg as unknown as { _id?: { $oid: string } })._id?.$oid ||
                msg.id,
              chatId:
                (msg as unknown as { chatId?: { $oid: string } }).chatId
                  ?.$oid || msg.chatId,
              from:
                (msg as unknown as { from?: { $oid: string } }).from?.$oid ||
                msg.from,
              createdAt:
                (msg as unknown as { createdAt?: { $date: string } }).createdAt
                  ?.$date || msg.createdAt,
              updatedAt:
                (msg as unknown as { updatedAt?: { $date: string } }).updatedAt
                  ?.$date || msg.updatedAt,
            }),
          );

          // Send message receipts for unread messages (REALTIME_EVENTS.md)
          const { accessToken, user } = useAuthStore.getState();
          if (accessToken && user?.id) {
            try {
              const socket = getSocket();
              if (socket) {
                // Collect all message IDs that were sent by the other user (not us) and don't have our read receipt
                const unreadMessageIds = normalizedChat.messages
                  .filter((msg: Message) => msg.from !== user.id)
                  .filter((msg: Message) => {
                    // Check if we already have a read receipt for this message
                    const hasReadReceipt = msg.receipts?.some(
                      (r) => r.userId === user.id && r.readAt,
                    );
                    return !hasReadReceipt;
                  })
                  .map((msg: Message) => msg.id);

                if (unreadMessageIds.length > 0) {
                  // First mark messages as delivered
                  socket.emit(
                    "chat:delivered",
                    {
                      messageIds: unreadMessageIds,
                    },
                    () => {},
                  );
                  // Then mark them as read since we're actively viewing the chat
                  socket.emit(
                    "chat:read",
                    { messageIds: unreadMessageIds },
                    () => {},
                  );
                }
              }
            } catch (error) {
              console.error("[Chat] Failed to send message receipts:", error);
            }
          }
        }

        // Normalize members
        if (normalizedChat.members) {
          normalizedChat.members = normalizedChat.members.map(
            (member: ChatDetails["members"][0]) => ({
              ...member,
              id:
                (member as unknown as { _id?: { $oid: string } })._id?.$oid ||
                member.id,
            }),
          );
        }

        // Normalize chat main id
        normalizedChat.id =
          (normalizedChat as unknown as { _id?: { $oid: string } })._id?.$oid ||
          normalizedChat.id;

        markAsRead(chatId);
        return normalizedChat as ChatDetails;
      }
      throw new Error("Failed to load chat");
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // Garbage collect for 10 minutes
    refetchOnReconnect: true,
    enabled: !!chatId,
    refetchOnMount: false, // Don't refetch if already in cache
  });

  // Define proper types for sending messages as per CHATS_API.md

  interface SendTextMessage {
    type: "text";
    text: string;
    replyTo?: ReplyToMessage;
    clientMessageId: string;
  }

  // Add state for reply-to message
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      content,
      replyTo,
      clientMessageId,
    }: {
      content: string;
      replyTo?: ReplyToMessage;
      clientMessageId: string;
    }) => {
      const messageData: SendTextMessage = {
        type: "text",
        text: content,
        clientMessageId,
      };

      // Add replyTo if it exists (per CHATS_API.md ReplyToSchema)
      if (replyTo) {
        messageData.replyTo = replyTo;
      }

      const response = await apiFetch<{ ok: boolean; message: Message }>(
        `/api/chats/${chatId}/messages`,
        {
          method: "POST",
          body: JSON.stringify(messageData),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      return response;
    },
    onMutate: async ({ content, replyTo, clientMessageId }) => {
      // Create optimistic message for immediate rendering
      const optimisticMessage: Message = {
        id: clientMessageId,
        chatId: chatId,
        from: user?.id || "",
        type: "text",
        clientMessageId,
        text: content,
        reactions: [],
        receipts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replyTo: replyTo || undefined,
      };

      // Add to cache immediately
      queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return [optimisticMessage];
        return [...prev, optimisticMessage];
      });

      // Clear input immediately for responsive feel
      setNewMessage("");
      setReplyingTo(null);
    },
    onSuccess: (response) => {
      // Replace optimistic message with real one from server
      if (response.message) {
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((msg) =>
            msg.clientMessageId === response.message.clientMessageId
              ? response.message
              : msg,
          );
        });
      }
      // Update chats list to show latest message time
      queryClient.setQueryData(["chats"], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return prev;
        return prev.map((c) =>
          c.id === chatId ? { ...c, updatedAt: new Date().toISOString() } : c,
        );
      });
    },
    onError: (error, variables) => {
      console.error("[Chat] Failed to send message:", error);
      addToast("Failed to send message. Please try again.", "error");
      // Revert optimistic message if needed
      queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return prev;
        return prev.filter(
          (msg) => msg.clientMessageId !== variables.clientMessageId,
        );
      });
    },
  });

  // Use presence store for real-time online status tracking
  const { getUserPresence } = usePresenceStore();
  const otherParticipantFromChat = chat?.members?.find(
    (p) => p.id !== user?.id,
  );
  const presence = otherParticipantFromChat?.id
    ? getUserPresence(otherParticipantFromChat.id)
    : null;
  const isUserOnline = presence?.isOnline || false;
  const otherParticipant = otherParticipantFromChat;
  const isTyping = useTypingStore((state) => state.isSomeoneTyping(chatId));

  // Get current chat from store for pin/mute status
  const currentChat = chats.find((c) => c.id === chatId);

  // Extract socket handlers to useCallback for stable references
  const handleChatTyping = useCallback(
    ({
      from,
      isTyping,
      chatId: eventChatId,
    }: {
      chatId: string;
      from: string;
      isTyping: boolean;
    }) => {
      if (from !== user?.id && eventChatId === chatId) {
        if (isTyping) {
          startTyping(chatId, from);
        } else {
          stopTyping(chatId, from);
        }
      }
    },
    [chatId, user?.id, startTyping, stopTyping],
  );

  const handleChatMessage = useCallback(
    ({
      chatId: eventChatId,
      message,
    }:
      | import("@/types/realtime-events").ChatMessageServerEvent
      | import("@/types/realtime-events").ShareItemServerEvent) => {
      if (eventChatId === chatId) {
        // Normalize the incoming message and add to local state
        // Normalize reactions timestamps
        const normalizedReactions = message.reactions.map((reaction) => {
          const rawCreatedAt = (
            reaction as unknown as {
              createdAt?: { $date: string } | Date | string;
            }
          ).createdAt;
          // Handle MongoDB {$date: "iso-string"} format
          if (
            rawCreatedAt &&
            typeof rawCreatedAt === "object" &&
            "$date" in rawCreatedAt
          ) {
            return {
              ...reaction,
              createdAt: rawCreatedAt.$date,
            };
          }
          // Handle Date object
          if (
            rawCreatedAt !== null &&
            typeof rawCreatedAt === "object" &&
            "toISOString" in rawCreatedAt
          ) {
            return {
              ...reaction,
              createdAt: (rawCreatedAt as Date).toISOString(),
            };
          }
          // Already a string
          return {
            ...reaction,
            createdAt: rawCreatedAt as string,
          };
        });

        const normalizedReceipts = normalizeReceipts(message.receipts);

        // Normalize editedAt and deletedAt if they exist
        const normalizedEditedAt = message.editedAt
          ? (() => {
              const rawEditedAt =
                (message.editedAt as unknown as { $date?: string })?.$date ||
                message.editedAt;
              if (
                rawEditedAt !== null &&
                typeof rawEditedAt === "object" &&
                "toISOString" in rawEditedAt
              ) {
                return (rawEditedAt as Date).toISOString();
              }
              return rawEditedAt as string;
            })()
          : undefined;

        const normalizedDeletedAt = message.deletedAt
          ? (() => {
              const rawDeletedAt =
                (message.deletedAt as unknown as { $date?: string })?.$date ||
                message.deletedAt;
              if (
                rawDeletedAt !== null &&
                typeof rawDeletedAt === "object" &&
                "toISOString" in rawDeletedAt
              ) {
                return (rawDeletedAt as Date).toISOString();
              }
              return rawDeletedAt as string;
            })()
          : undefined;

        const normalizedMessage: Message = {
          ...message,
          item: normalizeShareItem(message.item),
          replyTo: (() => {
            const replyTo = (message as unknown as { replyTo?: ReplyToMessage })
              .replyTo;
            return replyTo
              ? { ...replyTo, item: normalizeShareItem(replyTo.item) }
              : replyTo;
          })(),
          id:
            (message as unknown as { _id?: { $oid: string } })._id?.$oid ||
            message.id,
          chatId:
            (message as unknown as { chatId?: { $oid: string } }).chatId
              ?.$oid || message.chatId,
          from:
            (message as unknown as { from?: { $oid: string } }).from?.$oid ||
            message.from,
          clientMessageId: message.clientMessageId || undefined,
          reactions: normalizedReactions,
          receipts: normalizedReceipts,
          editedAt: normalizedEditedAt,
          deletedAt: normalizedDeletedAt,
          createdAt: (() => {
            const rawCreatedAt =
              (message as unknown as { createdAt?: { $date: string } })
                .createdAt?.$date || message.createdAt;
            // If it's already a Date object, convert to ISO string
            if (
              rawCreatedAt &&
              typeof rawCreatedAt === "object" &&
              rawCreatedAt !== null &&
              "toISOString" in rawCreatedAt
            ) {
              return (rawCreatedAt as Date).toISOString();
            }
            return rawCreatedAt as string;
          })(),
          updatedAt: (() => {
            const rawUpdatedAt =
              (message as unknown as { updatedAt?: { $date: string } })
                .updatedAt?.$date ||
              message.updatedAt ||
              message.createdAt;
            // If it's already a Date object, convert to ISO string
            if (
              rawUpdatedAt &&
              typeof rawUpdatedAt === "object" &&
              rawUpdatedAt !== null &&
              "toISOString" in rawUpdatedAt
            ) {
              return (rawUpdatedAt as Date).toISOString();
            }
            return rawUpdatedAt as string;
          })(),
        };

        // Add new message to React Query cache so it appears immediately (matches RealtimeListener architecture)
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return [normalizedMessage];
          const messageExists = prev.some(
            (current) =>
              current.id === normalizedMessage.id ||
              (Boolean(normalizedMessage.clientMessageId) &&
                current.clientMessageId === normalizedMessage.clientMessageId),
          );
          if (messageExists) {
            return prev.map((current) =>
              current.id === normalizedMessage.id ||
              (Boolean(normalizedMessage.clientMessageId) &&
                current.clientMessageId === normalizedMessage.clientMessageId)
                ? normalizedMessage
                : current,
            );
          }
          // Messages are always added in order, no need to sort - append to end only
          return [...prev, normalizedMessage];
        });

        if (normalizedMessage.from !== user?.id) {
          const { accessToken } = useAuthStore.getState();
          if (accessToken) {
            try {
              const socket = getSocket();
              if (socket) {
                socket.emit(
                  "chat:delivered",
                  { messageIds: [normalizedMessage.id] },
                  () => {},
                );
                socket.emit(
                  "chat:read",
                  { messageIds: [normalizedMessage.id] },
                  () => {},
                );
              }
            } catch (error) {
              console.error("[Chat] Failed to send receipts:", error);
            }
          }
        }
      }
      // Only invalidate if absolutely necessary - avoid full re-renders
      queryClient.setQueryData(["chats"], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return prev;
        return prev.map((c) =>
          c.id === chatId ? { ...c, updatedAt: new Date().toISOString() } : c,
        );
      });
    },
    [chatId, user?.id, queryClient],
  );

  const handleChatReceipt = useCallback(
    ({
      chatId: eventChatId,
      messageIds,
      userId,
      type,
      at,
    }: import("@/types/realtime-events").ChatReceiptServerEvent) => {
      if (eventChatId !== chatId || userId === user?.id) return;
      queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return prev;
        return prev.map((message) => {
          if (!messageIds.includes(message.id)) return message;
          const remaining = message.receipts.filter(
            (receipt: {
              userId: string;
              deliveredAt?: string;
              readAt?: string;
              listenedAt?: string;
            }) => receipt.userId !== userId,
          );
          const current = message.receipts.find(
            (receipt: {
              userId: string;
              deliveredAt?: string;
              readAt?: string;
              listenedAt?: string;
            }) => receipt.userId === userId,
          );
          return {
            ...message,
            receipts: [
              ...remaining,
              {
                userId,
                deliveredAt: current?.deliveredAt || at,
                readAt: type === "read" ? at : current?.readAt,
                listenedAt: current?.listenedAt,
              },
            ],
          };
        });
      });
    },
    [chatId, user?.id, queryClient],
  );

  const handleVoiceListened = useCallback(
    ({
      chatId: eventChatId,
      messageId,
      userId,
      at,
    }: import("@/types/realtime-events").ChatVoiceListenedServerEvent) => {
      if (eventChatId !== chatId || userId === user?.id) return;
      queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
        if (!prev || !Array.isArray(prev)) return prev;
        return prev.map((message) =>
          message.id !== messageId
            ? message
            : {
                ...message,
                receipts: message.receipts.map(
                  (receipt: {
                    userId: string;
                    deliveredAt?: string;
                    readAt?: string;
                    listenedAt?: string;
                  }) =>
                    receipt.userId === userId
                      ? {
                          ...receipt,
                          deliveredAt: receipt.deliveredAt || at,
                          readAt: receipt.readAt || at,
                          listenedAt: at,
                        }
                      : receipt,
                ),
              },
        );
      });
    },
    [chatId, user?.id, queryClient],
  );

  const handleChatReaction = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
  }, [chatId, queryClient]);

  const handleChatLike = useCallback(
    (data: unknown) => {
      // Handle socket event being wrapped in array
      const eventData = Array.isArray(data) ? data[0] : data;
      const {
        chatId: eventChatId,
        messageId,
        userId,
        action,
        at,
      } = eventData as {
        chatId: string;
        messageId: string;
        userId: string;
        action: "added" | "removed";
        at: string;
      };

      if (eventChatId === chatId) {
        // If a like was added and it's not from the current user, show the love animation
        if (action === "added" && userId !== user?.id) {
          // Show the heart animation
          const heartId = crypto.randomUUID();
          // Position the heart in the middle of the screen for the receiver
          const x = window.innerWidth / 2 + Math.random() * 100 - 50;
          const y = window.innerHeight / 2 + Math.random() * 100 - 50;
          setMessageHearts((prev) =>
            [...prev, { id: heartId, x, y }].slice(-10),
          ); // Keep only last 10

          setTimeout(() => {
            setMessageHearts((prev) => prev.filter((h) => h.id !== heartId));
          }, 2000);
        }

        // Update React Query cache (matches RealtimeListener architecture)
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((msg) => {
            if (msg.id === messageId) {
              const currentLikes = msg.likes || [];
              if (action === "added") {
                return {
                  ...msg,
                  likes: [
                    ...currentLikes.filter(
                      (l: { userId: string; createdAt?: string }) =>
                        l.userId !== userId,
                    ),
                    { userId, createdAt: at },
                  ],
                };
              } else {
                return {
                  ...msg,
                  likes: currentLikes.filter(
                    (l: { userId: string; createdAt?: string }) =>
                      l.userId !== userId,
                  ),
                };
              }
            }
            return msg;
          });
        });
        // No need to invalidate - we already updated the cache directly
      }
    },
    [chatId, user?.id, queryClient],
  );

  const handleMessageEdited = useCallback(
    ({
      chatId: eventChatId,
      messageId,
      text,
      editedAt,
    }: {
      chatId: string;
      messageId: string;
      text: string;
      editedAt: string;
    }) => {
      if (eventChatId === chatId) {
        // Update React Query cache (matches RealtimeListener architecture)
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((msg) =>
            msg.id === messageId ? { ...msg, text, editedAt: editedAt } : msg,
          );
        });
        // No need to invalidate - we already updated the cache directly
      }
    },
    [chatId, queryClient],
  );

  const handleMessageDeleted = useCallback(
    ({
      chatId: eventChatId,
      messageId,
      deletedAt,
    }: {
      chatId: string;
      messageId: string;
      deletedAt: string;
    }) => {
      if (eventChatId === chatId) {
        // Update React Query cache (matches RealtimeListener architecture)
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, deletedAt: deletedAt, text: null }
              : msg,
          );
        });
        // No need to invalidate - we already updated the cache directly
      }
    },
    [chatId, queryClient],
  );

  const handleIncomingHeart = useCallback(
    (data: { from: string; chatId: string }) => {
      if (data.from !== user?.id && data.chatId === chatId) {
        const id = crypto.randomUUID();
        const x = 50 + Math.random() * 100;
        const y = window.innerHeight - 100 - Math.random() * 50;
        setMessageHearts((prev) => [...prev, { id, x, y }].slice(-8));
        setTimeout(() => {
          setMessageHearts((prev) => prev.filter((h) => h.id !== id));
        }, 2000);
      }
    },
    [chatId, user?.id],
  );

  const handleIncomingKiss = useCallback(
    (data: { from: string; chatId: string }) => {
      if (data.from !== user?.id && data.chatId === chatId) {
        const id = crypto.randomUUID();
        const x = 50 + Math.random() * 100;
        const y = window.innerHeight - 100 - Math.random() * 50;
        setMessageKisses((prev) => [...prev, { id, x, y }].slice(-5));
        setTimeout(() => {
          setMessageKisses((prev) => prev.filter((k) => k.id !== id));
        }, 3500);
      }
    },
    [chatId, user?.id],
  );

  // Socket event listeners - Updated to use REALTIME_EVENTS.md specification
  useEffect(() => {
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id || !chatId) return;

    try {
      const socket = getSocket();
      if (!socket) return;

      // `chat:enter` - Client → Server: Notify server we've entered the chat (REALTIME_EVENTS.md)
      socket.emit("chat:enter", { chatId: chatId }, (response) => {
        if (response.ok) {
        }
      });

      // Set up chat ping interval to maintain active status (30-second inactivity timer)
      const chatPingInterval = setInterval(() => {
        socket.emit("chat:ping", { chatId: chatId }, (response) => {
          if (response.ok) {
            // Successfully renewed active status
          }
        });
      }, 25000); // Ping every 25s to stay under 30s inactivity limit

      // Register only official events from REALTIME_EVENTS.md
      socket.on("chat:typing", handleChatTyping);
      socket.on("chat:message", handleChatMessage);
      socket.on("share:item", handleChatMessage);
      socket.on("chat:receipt", handleChatReceipt);
      socket.on("chat:voice:listened", handleVoiceListened);
      socket.on("chat:reaction", handleChatReaction);
      socket.on("chat:like", handleChatLike);
      socket.on("chat:message:edited", handleMessageEdited);
      socket.on("chat:message:deleted", handleMessageDeleted);
      socket.on("chat:heart", handleIncomingHeart);
      socket.on("chat:kiss", handleIncomingKiss);

      return () => {
        clearInterval(chatPingInterval);
        socket.off("chat:typing", handleChatTyping);
        socket.off("chat:message", handleChatMessage);
        socket.off("share:item", handleChatMessage);
        socket.off("chat:receipt", handleChatReceipt);
        socket.off("chat:voice:listened", handleVoiceListened);
        socket.off("chat:reaction", handleChatReaction);
        socket.off("chat:like", handleChatLike);
        socket.off("chat:message:edited", handleMessageEdited);
        socket.off("chat:message:deleted", handleMessageDeleted);
        // Properly remove specific handlers to prevent memory leaks
        socket.off("chat:heart", handleIncomingHeart);
        socket.off("chat:kiss", handleIncomingKiss);
        socket.emit("chat:leave", { chatId: chatId }, (response) => {
          if (response.ok) {
          }
        });
      };
    } catch (error) {
      console.error("[Chat] Failed to initialize socket:", error);
    }
  }, [
    chatId,
    user?.id,
    queryClient,
    startTyping,
    stopTyping,
    handleChatTyping,
    handleChatMessage,
    handleVoiceListened,
    handleChatReceipt,
    handleChatReaction,
    handleChatLike,
    handleMessageEdited,
    handleMessageDeleted,
    handleIncomingHeart,
    handleIncomingKiss,
  ]);

  // Initial fetch is handled by useQuery - no need for manual fetch

  // Set up scroll listener for infinite loading
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    // Emit typing event - REALTIME_EVENTS.md specification
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id || !chatId) return;

    try {
      const socket = getSocket();
      if (socket && chatId) {
        // `chat:typing` - Client → Server: Send typing indicator status (REALTIME_EVENTS.md)
        socket.emit(
          "chat:typing",
          { chatId: chatId, isTyping: true },
          (response) => {
            if (response.ok) {
              // Typing status sent successfully
            }
          },
        );

        // Clear previous timeout
        if (typingTimeout) clearTimeout(typingTimeout);

        // Set new timeout to emit stop typing after 2s of inactivity
        const timeout = setTimeout(() => {
          socket.emit(
            "chat:typing",
            { chatId: chatId, isTyping: false },
            () => {},
          );
        }, 2000);
        setTypingTimeout(timeout);
      }
    } catch (error) {
      console.error("[Chat] Failed to emit typing event:", error);
    }
  };

  const startCamera = async () => {
    try {
      // Mount the video element before assigning its stream.
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" } },
        audio: false,
      });
      streamRef.current = stream;
      const facingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
      // A selfie camera should feel like a mirror; never mirror a confirmed rear camera.
      setIsMirroredCamera(facingMode !== "environment");
      setCameraStream(stream);
    } catch (error) {
      setIsCameraOpen(false);
      setIsMirroredCamera(true);
      console.error("Failed to access camera:", error);
      addToast("Could not access camera. Please check permissions.", "error");
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!isCameraOpen || !video || !cameraStream) return;
    video.srcObject = cameraStream;
    const startPlayback = async () => {
      try {
        await video.play();
      } catch (error) {
        console.error("Camera preview could not start:", error);
        addToast("Camera preview could not start. Please try again.", "error");
      }
    };
    video.onloadedmetadata = startPlayback;
    void startPlayback();
    return () => {
      video.onloadedmetadata = null;
    };
  }, [isCameraOpen, cameraStream, addToast]);

  const addOptimisticMedia = (file: File, clientMessageId: string) => {
    const item: ShareItem = {
      kind: file.type.startsWith("video/") ? "video" : "image",
      url: URL.createObjectURL(file),
      originalName: file.name,
      mime: file.type,
      size: file.size,
    };
    const temporaryId = `upload-${clientMessageId}`;
    const optimisticMessage = {
      id: temporaryId,
      chatId,
      from: user?.id || "",
      type: "share",
      clientMessageId,
      item,
      reactions: [],
      receipts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadProgress: 0,
    };
    // Add to React Query cache (matches RealtimeListener architecture)
    queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
      if (!prev || !Array.isArray(prev)) return [optimisticMessage];
      // Keep messages sorted by creation time
      return [...prev, optimisticMessage].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    return temporaryId;
  };

  const updateOptimisticUpload = (id: string, changes: Partial<Message>) => {
    // Update in React Query cache (matches RealtimeListener architecture)
    queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
      if (!prev || !Array.isArray(prev)) return prev;
      return prev.map((message) =>
        message.id === id ? { ...message, ...changes } : message,
      );
    });
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    setIsMirroredCamera(true);
    setIsCameraOpen(false);
  };

  // Handle media file selection from device gallery
  const handleMediaFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];
    if (!validTypes.includes(file.type)) {
      addToast("Please select a valid image or video file", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      addToast("File is too large. Maximum size is 50MB", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const temporaryId = addOptimisticMedia(file, clientMessageId);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFormDataWithProgress<{
        ok: boolean;
        item: ShareItem;
      }>("/api/uploads", formData, (uploadProgress) =>
        updateOptimisticUpload(temporaryId, { uploadProgress }),
      );

      if (!response.ok || !response.item) throw new Error("Upload failed");

      // Set correct item kind based on file type
      response.item.kind = file.type.startsWith("video/") ? "video" : "image";
      // Prepend API base URL to ensure media loads from correct domain
      if (response.item.url && !response.item.url.startsWith("http")) {
        response.item.url = `${env.API_BASE_URL}${response.item.url}`;
      }

      updateOptimisticUpload(temporaryId, {
        item: response.item,
        uploadProgress: undefined,
      });
      const socket = getSocket();
      // Prepare replyTo data if we're replying to a message - sanitized to avoid server validation errors
      let replyToData: ReplyToMessage | undefined;
      if (replyingTo && otherParticipant) {
        // Populate all required ReplyToMessage fields to match server schema
        replyToData = {
          id: replyingTo.id,
          text: replyingTo.text || null,
          from: replyingTo.from,
          type: replyingTo.type,
          item: replyingTo.item
            ? {
                kind: replyingTo.item.kind,
                url: replyingTo.item.url,
                originalName: replyingTo.item.originalName,
                mime: replyingTo.item.mime,
                size: replyingTo.item.size,
                meta: replyingTo.item.meta,
              }
            : undefined,
        };
      }

      if (socket && otherParticipant) {
        socket.emit(
          "share:item",
          {
            replyTo: replyToData,
            to: otherParticipant.id,
            clientMessageId,
            item: response.item,
          },
          () => {},
        );
      }

      addToast(
        `${file.type.startsWith("video/") ? "Video" : "Image"} sent successfully!`,
        "success",
      );
    } catch (error) {
      console.error("Failed to upload media file:", error);
      updateOptimisticUpload(temporaryId, {
        uploadFailed: true,
        uploadProgress: undefined,
      });
      addToast("Failed to upload file. Please try again.", "error");
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Monitor call state to auto-pause voice recording when a call is received
  useEffect(() => {
    const { activeCall, incomingCall } = useCallsStore.getState();
    const isInAnyCall = !!activeCall || !!incomingCall;

    // If we get a call while recording, pause the recording
    if (
      isInAnyCall &&
      isRecording &&
      audioRecorderPauseRef.current &&
      !wasRecordingBeforeCall.current
    ) {
      wasRecordingBeforeCall.current = true;
      audioRecorderPauseRef.current();
      addToast("Call received - voice recording paused", "info");
    }

    const unsubscribe = useCallsStore.subscribe((state) => {
      const { activeCall: newActiveCall, incomingCall: newIncomingCall } =
        state;
      const isStillInCall = !!newActiveCall || !!newIncomingCall;

      if (!isStillInCall && wasRecordingBeforeCall.current) {
        wasRecordingBeforeCall.current = false;
        addToast(
          "Call ended - voice recording is paused, tap play to resume",
          "info",
        );
      }
    });

    return () => unsubscribe();
  }, [isRecording, addToast]);

  const captureAndSendPhoto = async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !chatId ||
      !user?.id ||
      !otherParticipant
    )
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      addToast(
        "Camera is still starting. Please try the shutter again.",
        "info",
      );
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The saved image must exactly match the natural mirror view the user saw.
    if (isMirroredCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    // Convert canvas to blob
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        stopCamera();

        let temporaryId: string | undefined;
        try {
          const photoFile = new File([blob], "camera_photo.jpg", {
            type: "image/jpeg",
          });
          const clientMessageId = crypto.randomUUID();
          temporaryId = addOptimisticMedia(photoFile, clientMessageId);
          const formData = new FormData();
          formData.append("file", photoFile);

          const response = await apiFormDataWithProgress<{
            ok: boolean;
            item: ShareItem;
          }>("/api/uploads", formData, (uploadProgress) =>
            updateOptimisticUpload(temporaryId!, { uploadProgress }),
          );

          if (!response.ok || !response.item) throw new Error("Upload failed");

          response.item.kind = "image";
          if (response.item.url && !response.item.url.startsWith("http")) {
            response.item.url = `${env.API_BASE_URL}${response.item.url}`;
          }

          updateOptimisticUpload(temporaryId, {
            item: response.item,
            uploadProgress: undefined,
          });
          const socket = getSocket();
          if (socket && otherParticipant) {
            socket.emit(
              "share:item",
              {
                to: otherParticipant.id,
                clientMessageId,
                item: response.item,
              },
              () => {},
            );
          }
        } catch (error) {
          console.error("Photo upload error:", error);
          if (temporaryId)
            updateOptimisticUpload(temporaryId, {
              uploadFailed: true,
              uploadProgress: undefined,
            });
          addToast("Failed to send photo", "error");
        }
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleSendVoiceNote = useCallback(
    async (blob: Blob, duration: number) => {
      if (!chatId || !user?.id) return;

      setIsUploadingVoice(true);
      try {
        const formData = new FormData();
        const extension = blob.type.includes("webm") ? "webm" : "ogg";
        formData.append("file", blob, `voice_note.${extension}`);

        const response = await apiFormData<{
          ok: boolean;
          item: ShareItem;
        }>("/api/uploads", formData);

        if (!response.ok || !response.item) throw new Error("Upload failed");

        response.item.meta = { ...response.item.meta, duration };
        response.item.kind = "audio";
        // Prepend API base URL to ensure audio loads from correct domain
        if (response.item.url && !response.item.url.startsWith("http")) {
          response.item.url = `${env.API_BASE_URL}${response.item.url}`;
        }

        const clientMessageId = crypto.randomUUID();

        const socket = getSocket();
        if (socket && otherParticipant) {
          socket.emit(
            "share:item",
            {
              to: otherParticipant.id,
              clientMessageId,
              item: response.item,
            },
            () => {},
          );
        }
      } catch (error) {
        console.error("Voice note upload error:", error);
        addToast("Failed to send voice note", "error");
      } finally {
        setIsUploadingVoice(false);
        setIsRecording(false);
        setReplyingTo(null); // Clear reply-to after sending voice note
      }
    },
    [chatId, user?.id, otherParticipant, addToast],
  );

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // Emit stop typing before sending - REALTIME_EVENTS.md specification
    const { accessToken, user } = useAuthStore.getState();
    if (accessToken && user?.id && chatId) {
      try {
        const socket = getSocket();
        if (socket) {
          // `chat:typing` - Client → Server: Send typing indicator status (REALTIME_EVENTS.md)
          socket.emit(
            "chat:typing",
            { chatId: chatId, isTyping: false },
            () => {},
          );
        }
      } catch (error) {
        console.error("[Chat] Failed to emit stop typing event:", error);
      }
    }
    if (typingTimeout) clearTimeout(typingTimeout);

    // Prepare replyTo data if we're replying to a message
    let replyToData: ReplyToMessage | undefined;
    if (replyingTo && otherParticipant) {
      // Populate all required ReplyToMessage fields to match server schema
      replyToData = {
        id: replyingTo.id,
        text: replyingTo.text || null,
        from: replyingTo.from,
        type: replyingTo.type,
        item: replyingTo.item
          ? {
              kind: replyingTo.item.kind,
              url: replyingTo.item.url,
              originalName: replyingTo.item.originalName,
              mime: replyingTo.item.mime,
              size: replyingTo.item.size,
              meta: replyingTo.item.meta,
            }
          : undefined,
      };
    }

    // Generate client-side message ID for deduplication
    const clientMessageId = crypto.randomUUID();
    sendMessageMutation.mutate({
      content: newMessage.trim(),
      replyTo: replyToData,
      clientMessageId,
    });
  };

  // Function to send a floating love heart
  const sendLoveHeart = useCallback(
    (e: React.MouseEvent) => {
      const id = crypto.randomUUID();
      const x = e.clientX || 100;
      const y = e.clientY || window.innerHeight - 100;

      setMessageHearts((prev) =>
        [
          ...prev,
          {
            id,
            x,
            y,
          },
        ].slice(-4),
      );

      // Remove after animation completes
      setTimeout(() => {
        setMessageHearts((prev) => prev.filter((h) => h.id !== id));
      }, 1850);

      const socket = getSocket();
      const now = Date.now();
      if (socket && chatId && now - lastHeartEmitRef.current > 350) {
        socket.emit("chat:heart", { chatId }, () => {});
        lastHeartEmitRef.current = now;
      }
    },
    [chatId],
  );

  // Function to send a floating kiss animation
  const sendLoveKiss = useCallback(
    (e: React.MouseEvent) => {
      const id = crypto.randomUUID();
      const x = e.clientX || 100;
      const y = e.clientY || window.innerHeight - 100;

      setMessageKisses((prev) =>
        [
          ...prev,
          {
            id,
            x,
            y,
          },
        ].slice(-4),
      );

      // Remove after animation completes
      setTimeout(() => {
        setMessageKisses((prev) => prev.filter((k) => k.id !== id));
      }, 1850);

      const socket = getSocket();
      const now = Date.now();
      if (socket && chatId && now - lastKissEmitRef.current > 700) {
        socket.emit("chat:kiss", { chatId }, () => {});
        lastKissEmitRef.current = now;
      }
    },
    [chatId],
  );

  // Double tap/click to send love reaction
  const handleMessageDoubleClick = useCallback(
    (messageId: string, e: React.MouseEvent) => {
      e.preventDefault();

      // First check if we're adding a like (not removing it)
      const message = messages.find((m) => m.id === messageId);
      const currentLikes = message?.likes || [];
      const hasLiked = currentLikes.some((l) => l.userId === user?.id);

      // Only show heart animation when ADDING a like (not when unliking/removing)
      if (!hasLiked && user?.id) {
        setShowLoveReaction(messageId);
        const heartId = crypto.randomUUID();
        setMessageHearts((prev) => [
          ...prev,
          {
            id: heartId,
            x: e.clientX,
            y: e.clientY,
          },
        ]);

        setTimeout(() => {
          setShowLoveReaction(null);
          setMessageHearts((prev) => prev.filter((h) => h.id !== heartId));
        }, 1500);
      }

      // Optimistic update - update React Query cache (matches RealtimeListener architecture)
      if (user?.id) {
        queryClient.setQueryData(["messages", chatId], (prev: unknown) => {
          if (!prev || !Array.isArray(prev)) return prev;
          return prev.map((m) => {
            if (m.id === messageId) {
              const currentLikes = m.likes || [];
              const hasLiked = currentLikes.some(
                (l: { userId: string; createdAt?: string }) =>
                  l.userId === user.id,
              );
              return {
                ...m,
                likes: hasLiked
                  ? currentLikes.filter(
                      (l: { userId: string; createdAt?: string }) =>
                        l.userId !== user.id,
                    )
                  : [
                      ...currentLikes,
                      { userId: user.id, createdAt: new Date().toISOString() },
                    ],
              };
            }
            return m;
          });
        });
      }

      const socket = getSocket();
      if (socket) {
        socket.emit("chat:like", { messageId }, (response) => {
          if (!response?.ok) {
            console.error("Failed to toggle like");
          }
        });
      }
    },
    [user?.id, messages, chatId, queryClient],
  );

  if (isLoading || !chat) {
    return <HeartbeatLoading message="Loading conversation..." />;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rouge+Script&display=swap');
        .love-message-font {
          font-family: 'Rouge Script', cursive;
        }
        .golden-glow {
          box-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.4), 0 0 60px rgba(251, 191, 36, 0.2);
        }
      `}</style>
      <div className="h-full min-h-0 w-full flex flex-col relative bg-linear-to-br from-rose-100 via-pink-50 to-rose-100 md:rounded-2xl md:mx-auto md:max-w-6xl overflow-hidden">
        {/* Enhanced animated background with subtle particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {hearts.map((heart) => (
            <FloatingHeart key={heart.id} delay={heart.delay} x={heart.x} />
          ))}
          {/* Additional romantic particles */}
          <motion.div
            animate={{
              y: [0, -30, 0],
              x: [0, 15, -15, 0],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{ duration: 6, repeat: Infinity, delay: 0.5 }}
            className="absolute top-1/4 left-1/4"
          >
            <Sparkles className="w-4 h-4 text-pink-300" />
          </motion.div>
          <motion.div
            animate={{
              y: [0, -25, 0],
              x: [0, -10, 10, 0],
              opacity: [0.15, 0.35, 0.15],
            }}
            transition={{ duration: 7, repeat: Infinity, delay: 2 }}
            className="absolute top-1/3 right-1/4"
          >
            <Sparkles className="w-3 h-3 text-rose-300" />
          </motion.div>
        </div>

        {/* Short celebratory bursts keep the interaction playful without taxing scrolling. */}
        <AnimatePresence>
          {messageHearts.map((heart) => (
            <RomanticBurst
              key={heart.id}
              kind="heart"
              x={heart.x}
              y={heart.y}
            />
          ))}
          {messageKisses.map((kiss) => (
            <RomanticBurst key={kiss.id} kind="kiss" x={kiss.x} y={kiss.y} />
          ))}
        </AnimatePresence>

        {/* Enhanced Romantic Header with glassmorphism */}
        <header className="relative z-20 w-full bg-linear-to-r from-rose-400/95 via-pink-400/95 to-rose-400/95 backdrop-blur-2xl border-b border-rose-200/60 p-2 md:p-3 shadow-2xl shadow-rose-300/60 shrink-0">
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute -top-8 -right-8"
            >
              <Heart className="w-32 h-32 text-white/20 fill-white/20" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 5, repeat: Infinity, delay: 1 }}
              className="absolute -bottom-4 -left-4"
            >
              <Heart className="w-24 h-24 text-white/20 fill-white/20" />
            </motion.div>
          </div>

          <div className="max-w-4xl mx-auto flex items-center gap-1 md:gap-3 relative">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-full hover:bg-white/20 transition-all duration-300 lg:hidden backdrop-blur-sm"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="relative"
            >
              <div className="w-10 h-10 md:w-20 md:h-20 rounded-full bg-linear-to-br from-white to-rose-100 flex items-center justify-center shadow-2xl shadow-rose-300/60 ring-4 ring-white/60">
                <span className="bg-linear-to-br from-rose-500 to-pink-500 bg-clip-text text-transparent font-bold text-lg md:text-2xl">
                  {otherParticipant?.username?.[0]?.toUpperCase()}
                </span>
              </div>
              {isUserOnline && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 md:w-5 md:h-5 bg-green-400 rounded-full border-4 border-white shadow-xl"
                >
                  <motion.div
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-full h-full bg-green-400 rounded-full"
                  />
                </motion.div>
              )}
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute -top-2 -right-2 md:-top-3 md:-right-3"
              >
                <Heart className="w-6 h-6 md:w-8 md:h-8 text-rose-300 fill-rose-300 drop-shadow-lg" />
              </motion.div>
            </motion.div>

            <div className="flex-1">
              <motion.h2
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="font-bold text-white text-base md:text-xl drop-shadow-md truncate"
              >
                {otherParticipant?.username}
              </motion.h2>
              <p className="text-sm text-white/90">
                {isTyping ? (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-white font-medium flex items-center gap-1"
                  >
                    typing
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      ...
                    </motion.span>
                    <Heart className="w-4 h-4 ml-1 text-white fill-white animate-pulse" />
                  </motion.span>
                ) : isUserOnline === true ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="text-white/70">
                    Last seen{" "}
                    {presence?.lastSeenAt
                      ? formatTime(presence.lastSeenAt)
                      : "recently"}
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={() => {
                if (otherParticipant?.id && user?.id) {
                  if (isBlockedEitherWay(user.id, otherParticipant.id)) {
                    addToast(
                      "Cannot call this user - you have blocked them",
                      "error",
                    );
                    return;
                  }
                  initiateCall(otherParticipant, "audio");
                }
              }}
              className="p-2 md:p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
            >
              <Phone className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => {
                if (otherParticipant?.id && user?.id) {
                  if (isBlockedEitherWay(user.id, otherParticipant.id)) {
                    addToast(
                      "Cannot call this user - you have blocked them",
                      "error",
                    );
                    return;
                  }
                  initiateCall(otherParticipant, "video");
                }
              }}
              className="p-2 md:p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
            >
              <Video className="w-5 h-5 text-white" />
            </button>

            {/* Chat actions menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 md:p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>
              <div
                className={`absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl transition-all duration-200 z-50 border border-rose-100 ${isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
              >
                <button
                  onClick={() =>
                    currentChat?.isPinned
                      ? unpinChatMutation.mutate()
                      : pinChatMutation.mutate()
                  }
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-rose-50 first:rounded-t-xl flex items-center gap-2 transition-colors"
                >
                  {currentChat?.isPinned ? "📌 Unpin chat" : "📌 Pin chat"}
                </button>
                <button
                  onClick={() =>
                    currentChat?.isMuted
                      ? unmuteChatMutation.mutate()
                      : muteChatMutation.mutate()
                  }
                  className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-rose-50 last:rounded-b-xl flex items-center gap-2 transition-colors"
                >
                  {currentChat?.isMuted ? "🔊 Unmute chat" : "🔇 Mute chat"}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Enhanced Romantic Messages Container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-2 md:p-3 relative z-10 scrollbar-thin scrollbar-thumb-rose-300 scrollbar-track-transparent"
        >
          <div className="w-full mx-auto space-y-6 md:space-y-8">
            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="flex justify-center">
                <span className="px-4 py-2 rounded-full bg-white/70 text-rose-500 text-sm">
                  Loading more messages...
                </span>
              </div>
            )}

            {/* Date separator */}
            {messages.length > 0 && (
              <div className="flex justify-center">
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-4 py-1.5 rounded-full bg-white/70 backdrop-blur-sm text-rose-500 text-xs font-medium shadow-md border border-rose-200/50 flex items-center gap-1"
                >
                  <Heart className="w-3 h-3 fill-current" /> Today&rsquo;s
                  Messages
                </motion.span>
              </div>
            )}

            {messages.map((message, index) => {
              const isOwn = message.from === user?.id;
              const showAvatar =
                index === 0 || messages[index - 1]?.from !== message.from;
              const isLoveMessage =
                message.text?.toLowerCase().includes("love") ||
                message.text?.toLowerCase().includes("❤") ||
                message.text?.toLowerCase().includes("heart") ||
                message.text?.toLowerCase().includes("kiss") ||
                message.text?.toLowerCase().includes("pyari") ||
                message.text?.toLowerCase().includes("jana") ||
                message.text?.toLowerCase().includes("biwi") ||
                message.text?.toLowerCase().includes("kinni") ||
                message.text?.toLowerCase().includes("romantic") ||
                message.text?.toLowerCase().includes("romance") ||
                message.text?.toLowerCase().includes("darling") ||
                message.text?.toLowerCase().includes("honey") ||
                message.text?.toLowerCase().includes("sweetheart") ||
                message.text?.toLowerCase().includes("babe") ||
                message.text?.toLowerCase().includes("baby") ||
                message.text?.toLowerCase().includes("miss you") ||
                message.text?.toLowerCase().includes("miss u") ||
                message.text?.toLowerCase().includes("beautiful") ||
                message.text?.toLowerCase().includes("cute") ||
                message.text?.toLowerCase().includes("sweetuuu") ||
                message.text?.toLowerCase().includes("💖") ||
                message.text?.toLowerCase().includes("💗") ||
                message.text?.toLowerCase().includes("💓") ||
                message.text?.toLowerCase().includes("💕") ||
                message.text?.toLowerCase().includes("💘") ||
                message.text?.toLowerCase().includes("💝") ||
                message.text?.toLowerCase().includes("😍") ||
                message.text?.toLowerCase().includes("💋") ||
                message.text?.toLowerCase().includes("🥰");
              const isShowingLove = showLoveReaction === message.id;
              const isEditing = editingMessageId === message.id;
              const recipientReceipt = message.receipts?.find(
                (receipt) => receipt.userId !== user?.id,
              );
              const isRead = Boolean(recipientReceipt?.readAt);
              const isDelivered = Boolean(recipientReceipt?.deliveredAt);
              const isVoiceListened = Boolean(recipientReceipt?.listenedAt);

              return (
                <motion.div
                  key={message.id}
                  id={`message-${message.id}`}
                  ref={
                    activeMessageActions === message.id
                      ? messageActionsRef
                      : null
                  }
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  onDoubleClick={(e) => handleMessageDoubleClick(message.id, e)}
                  onTouchStart={() => handleMessageTouchStart(message.id)}
                  onTouchEnd={handleMessageTouchEnd}
                  onTouchCancel={handleMessageTouchEnd}
                  className={cn(
                    "flex items-end gap-3 cursor-pointer",
                    isOwn ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  {showAvatar && !isOwn ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-12 h-12 rounded-full bg-linear-to-br from-rose-400 via-pink-400 to-rose-500 flex items-center justify-center text-white text-base font-bold shrink-0 shadow-xl shadow-rose-300/60 ring-4 ring-white/60"
                    >
                      {otherParticipant?.username?.[0]?.toUpperCase()}
                    </motion.div>
                  ) : !isOwn ? (
                    <div className="w-12" />
                  ) : null}

                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl px-5 py-4 rounded-3xl relative group/message",
                      isOwn
                        ? "bg-linear-to-r from-rose-500 via-pink-500 to-rose-500 text-white rounded-br-2xl shadow-2xl shadow-rose-300/70"
                        : "bg-white/95 backdrop-blur-md text-gray-800 rounded-bl-2xl shadow-xl shadow-pink-200/60 border border-rose-100/60",
                      isLoveMessage && "ring-4 ring-yellow-300/70 golden-glow",
                      message.deletedAt && "opacity-50",
                    )}
                  >
                    {isLoveMessage && <MessageSparkles />}

                    <AnimatePresence>
                      {isShowingLove && (
                        <motion.div
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1.5, rotate: 0 }}
                          exit={{ scale: 0 }}
                          className="absolute inset-0 flex items-center justify-center bg-rose-500/30 rounded-3xl z-10"
                        >
                          <Heart className="w-16 h-16 text-white fill-white drop-shadow-2xl" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Message actions for all messages */}
                    {!message.deletedAt && (
                      <div
                        ref={
                          activeMessageActions === message.id
                            ? messageActionsRef
                            : null
                        }
                        className={cn(
                          "absolute -top-10 flex gap-1.5 transition-all duration-200 z-10",
                          activeMessageActions === message.id
                            ? "opacity-100 flex"
                            : "opacity-0 pointer-events-none md:group-hover/message:opacity-100 md:pointer-events-auto",
                          isOwn ? "right-2" : "left-2",
                        )}
                      >
                        {/* Reply button - available for all messages */}
                        <button
                          onClick={() => {
                            setReplyingTo(message);
                            inputRef.current?.focus();
                          }}
                          className="p-2 rounded-full bg-white hover:bg-rose-50 shadow-lg transition-all hover:scale-110 border border-rose-200"
                          title="Reply to message"
                        >
                          <svg
                            className="w-4 h-4 text-rose-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                        </button>
                        {/* Edit button - only for own messages */}
                        {isOwn && message.type === "text" && (
                          <button
                            onClick={() => {
                              setEditingMessageId(message.id);
                              setEditText(message.text || "");
                            }}
                            className="p-2 rounded-full bg-white hover:bg-gray-100 shadow-lg transition-all hover:scale-110 border border-gray-200"
                            title="Edit message"
                          >
                            <svg
                              className="w-4 h-4 text-gray-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                        )}
                        {/* Delete button - only for own messages */}
                        {isOwn && (
                          <button
                            onClick={() =>
                              deleteMessageMutation.mutate(message.id)
                            }
                            className="p-2 rounded-full bg-white hover:bg-red-50 shadow-lg transition-all hover:scale-110 border border-red-200"
                            title="Delete message"
                          >
                            <svg
                              className="w-4 h-4 text-red-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Display reply-to message if this message is a reply */}
                    {message.replyTo && !message.deletedAt && (
                      <div className="mb-2 px-3 py-2 rounded-lg bg-black/10 border-l-2 border-rose-400">
                        <p className="text-xs font-medium text-rose-300 mb-1">
                          Replied to{" "}
                          {message.replyTo.from === user?.id
                            ? "yourself"
                            : message.replyTo.fromName ||
                              otherParticipant?.username}
                        </p>
                        {message.replyTo.item?.kind === "audio" ? (
                          <div className="mt-1 max-w-50">
                            <VoiceNotePlayer
                              audioUrl={message.replyTo.item.url || ""}
                              duration={
                                message.replyTo.item.meta?.duration
                                  ? Number(message.replyTo.item.meta.duration)
                                  : 0
                              }
                              messageId={message.replyTo.id}
                              isOwn={message.from === user?.id}
                              isListened={
                                message.receipts?.some(
                                  (r) => r.userId === user?.id && r.listenedAt,
                                ) || false
                              }
                            />
                          </div>
                        ) : message.replyTo.item?.kind === "image" &&
                          message.replyTo.item.url ? (
                          <div className="mt-1 relative w-20 h-20">
                            <Image
                              src={message.replyTo.item.url}
                              alt="Replied image"
                              fill
                              className="object-cover rounded-lg border border-white/30"
                              sizes="80px"
                            />
                          </div>
                        ) : message.replyTo.item?.kind === "video" &&
                          message.replyTo.item.url ? (
                          <div className="mt-1 relative">
                            <video
                              src={message.replyTo.item.url}
                              className="w-20 h-20 object-cover rounded-lg border border-white/30"
                              muted
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                                <svg
                                  className="w-4 h-4 text-white"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ) : message.replyTo.item?.kind === "file" ? (
                          <p className="text-sm leading-relaxed line-clamp-2 italic opacity-80">
                            📎 File:{" "}
                            {message.replyTo.item.originalName || "Attachment"}
                          </p>
                        ) : (
                          <p className="text-sm leading-relaxed line-clamp-2">
                            {message.replyTo.text || "Media message"}
                          </p>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editText.trim()) {
                            editMessageMutation.mutate({
                              messageId: message.id,
                              text: editText.trim(),
                            });
                          }
                        }}
                        className="mt-1"
                      >
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="submit"
                            className="text-xs px-3 py-1 bg-white text-rose-500 rounded-full font-medium hover:bg-rose-50 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditText("");
                            }}
                            className="text-xs px-3 py-1 bg-white/20 text-white rounded-full font-medium hover:bg-white/30 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : message.deletedAt ? (
                      <p className="text-sm leading-relaxed italic">
                        This message was deleted
                      </p>
                    ) : message.type === "share" &&
                      message.item?.kind === "image" &&
                      message.item.url ? (
                      <div className="mt-2 relative rounded-2xl overflow-hidden shadow-xl max-w-xs md:max-w-sm lg:max-w-md ring-1 ring-white/20 bg-black/10">
                        <button
                          type="button"
                          onClick={() => setSelectedImage(message.item!.url)}
                          className="block max-w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-white"
                          aria-label="Open shared image"
                        >
                          <Image
                            src={message.item.url}
                            alt="Shared image"
                            width={800}
                            height={600}
                            className="block max-h-[60vh] w-auto max-w-full object-contain"
                            style={{ imageOrientation: "from-image" }}
                          />
                        </button>
                        {typeof message.uploadProgress === "number" && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-white backdrop-blur-[1px]">
                            <span className="text-sm font-medium">
                              Sending photo… {message.uploadProgress}%
                            </span>
                            <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-white/30">
                              <div
                                className="h-full bg-white transition-all"
                                style={{ width: `${message.uploadProgress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {message.uploadFailed && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-sm font-medium text-white">
                            Photo failed to send
                          </div>
                        )}
                      </div>
                    ) : message.type === "share" &&
                      message.item?.kind === "video" &&
                      message.item.url ? (
                      <div className="mt-2 rounded-2xl overflow-hidden shadow-xl max-w-xs md:max-w-sm lg:max-w-md ring-1 ring-white/20">
                        <video
                          src={message.item.url}
                          controls
                          playsInline
                          className="w-full h-auto rounded-2xl"
                          preload="metadata"
                        ></video>
                      </div>
                    ) : message.type === "share" &&
                      message.item?.kind === "audio" ? (
                      <VoiceNotePlayer
                        audioUrl={message.item.url}
                        duration={
                          message.item.meta?.duration as number | undefined
                        }
                        messageId={message.id}
                        isOwn={isOwn}
                        isListened={message.receipts?.some(
                          (r) => r.userId === user?.id && r.listenedAt,
                        )}
                      />
                    ) : (
                      <p
                        className={cn(
                          "text-sm leading-relaxed",
                          isLoveMessage &&
                            "love-message-font text-2xl md:text-3xl",
                        )}
                      >
                        {message.text}
                      </p>
                    )}

                    {!isEditing && !message.deletedAt && (
                      <div className="flex items-end justify-between mt-2 gap-3">
                        <div className="flex gap-1 items-center">
                          {message.likes && message.likes.length > 0 && (
                            <div className="relative group/likes">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={cn(
                                  "bg-white/30 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1 border cursor-pointer",
                                  isOwn
                                    ? "border-rose-300/50"
                                    : "border-rose-100/50",
                                )}
                              >
                                <Heart
                                  className={cn(
                                    "w-3 h-3 fill-rose-500",
                                    isOwn ? "text-rose-200" : "text-rose-500",
                                  )}
                                />
                                <span
                                  className={cn(
                                    "text-[11px] font-bold",
                                    isOwn ? "text-white" : "text-rose-600",
                                  )}
                                >
                                  {message.likes.length}
                                </span>
                              </motion.div>
                              {/* Beautiful tooltip showing who liked */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/likes:opacity-100 transition-opacity duration-200">
                                <div className="bg-linear-to-br from-rose-500 to-pink-600 text-white px-3 py-2 rounded-xl shadow-xl max-w-xs">
                                  <div className="flex items-center gap-2">
                                    <Heart className="w-3 h-3 fill-white" />
                                    <span className="text-[11px] font-semibold">
                                      Liked by
                                    </span>
                                  </div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {message.likes.map((like) => {
                                      const liker = chat?.members?.find(
                                        (m) => m.id === like.userId,
                                      );
                                      return (
                                        <div
                                          key={like.userId}
                                          className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2 py-1 rounded-full"
                                        >
                                          {liker?.avatar ? (
                                            <Image
                                              src={liker.avatar}
                                              alt={liker.username}
                                              className="w-4 h-4 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center">
                                              <span className="text-[9px] font-bold">
                                                {liker?.username?.[0]?.toUpperCase() ||
                                                  "?"}
                                              </span>
                                            </div>
                                          )}
                                          <span className="text-[11px] font-medium">
                                            {liker?.username || "Unknown"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                {/* Arrow */}
                                <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-1.5 h-1.5 bg-linear-to-br from-rose-500 to-pink-600 rotate-45" />
                              </div>
                            </div>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-xs flex items-center gap-1",
                            isOwn ? "text-rose-100" : "text-gray-400",
                          )}
                        >
                          {message.editedAt && (
                            <span className="mr-1">(edited)</span>
                          )}
                          {formatTime(message.createdAt)}
                          {isOwn &&
                            (isRead ? (
                              <CheckCheck
                                className="w-4 h-4 text-rose-100"
                                aria-label="Read"
                              />
                            ) : isDelivered ? (
                              <CheckCheck
                                className="w-4 h-4 text-rose-200/80"
                                aria-label="Delivered"
                              />
                            ) : (
                              <Check
                                className="w-4 h-4 text-rose-200/80"
                                aria-label="Sent"
                              />
                            ))}
                          {isOwn &&
                            message.type === "share" &&
                            message.item?.kind === "audio" &&
                            isVoiceListened && (
                              <Headphones
                                className="w-3.5 h-3.5 text-rose-100"
                                aria-label="Voice note listened to"
                              />
                            )}
                        </p>
                      </div>
                    )}
                  </motion.div>

                  {showAvatar && isOwn ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-12 h-12 rounded-full bg-linear-to-br from-pink-400 via-rose-400 to-pink-500 flex items-center justify-center text-white text-base font-bold shrink-0 shadow-xl shadow-pink-300/60 ring-4 ring-white/60"
                    >
                      {user?.username?.[0]?.toUpperCase()}
                    </motion.div>
                  ) : isOwn ? (
                    <div className="w-12" />
                  ) : null}
                </motion.div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Enhanced Romantic Message Input */}
        <footer className="relative z-10 w-full bg-linear-to-r from-white/98 via-rose-50/98 to-white/98 backdrop-blur-2xl border-t border-rose-200/70 p-3 md:p-4 shadow-2xl shrink-0">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              animate={{
                x: [0, 15, 0],
                y: [0, -5, 0],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: 5, repeat: Infinity }}
              className="absolute bottom-4 left-8"
            >
              <Heart className="w-10 h-10 text-rose-200 fill-rose-200" />
            </motion.div>
            <motion.div
              animate={{
                x: [0, -15, 0],
                y: [0, -8, 0],
                opacity: [0.25, 0.5, 0.25],
              }}
              transition={{ duration: 6, repeat: Infinity, delay: 2.5 }}
              className="absolute bottom-4 right-8"
            >
              <Heart className="w-8 h-8 text-pink-200 fill-pink-200" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 4, repeat: Infinity, delay: 1 }}
              className="absolute bottom-6 left-1/2 transform -translate-x-1/2"
            >
              <Sparkles className="w-6 h-6 text-pink-300" />
            </motion.div>
          </div>

          {/* Reply-to indicator - shows when replying to a message */}
          <AnimatePresence>
            {replyingTo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="max-w-4xl mx-auto mb-3 px-4 py-3 bg-rose-50 border-l-4 border-rose-500 rounded-r-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-rose-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  <div>
                    <p className="text-xs font-medium text-rose-600">
                      Replying to{" "}
                      {replyingTo.from === user?.id
                        ? "yourself"
                        : otherParticipant?.username}
                    </p>
                    <div className="text-sm text-gray-700 max-w-md">
                      {replyingTo.item?.kind === "audio" ? (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <div
                                key={i}
                                className="w-1 h-3 bg-rose-400 rounded-full"
                                style={{
                                  animation: "pulse 1s ease-in-out infinite",
                                  animationDelay: i * 0.1 + "s",
                                }}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-rose-600">
                            {replyingTo.item.meta?.duration
                              ? Math.floor(
                                  Number(replyingTo.item.meta.duration),
                                ) + "s"
                              : "Voice note"}
                          </span>
                        </div>
                      ) : replyingTo.item?.kind === "image" &&
                        replyingTo.item.url ? (
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden mt-1 border border-gray-200">
                          <Image
                            src={replyingTo.item.url}
                            alt="Image to reply"
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 px-1">
                            Image
                          </span>
                        </div>
                      ) : replyingTo.item?.kind === "video" &&
                        replyingTo.item.url ? (
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden mt-1 border border-gray-200">
                          <video
                            src={replyingTo.item.url}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </div>
                          </div>
                          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 px-1 text-center">
                            Video
                          </span>
                        </div>
                      ) : replyingTo.item?.kind === "file" ? (
                        <div className="flex items-center gap-2">
                          <span>📎</span>
                          <span className="truncate">
                            {replyingTo.item.originalName || "File attachment"}
                          </span>
                        </div>
                      ) : (
                        replyingTo.text || "Media message"
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    // Cancel reply and clear the replyingTo state
                    setReplyingTo(null);
                  }}
                  className="p-1.5 rounded-full hover:bg-rose-100 transition-colors"
                  title="Cancel reply"
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <form
            onSubmit={handleSendMessage}
            className="max-w-4xl mx-auto flex items-center gap-1.5 md:gap-2 relative px-2"
          >
            {isRecording ? (
              <AudioRecorderUI
                onSend={handleSendVoiceNote}
                onCancel={handleCancelRecording}
              />
            ) : (
              <>
                {/* Hide smiley on mobile, show heart in its place - mobile optimized */}
                <button
                  type="button"
                  onClick={sendLoveHeart}
                  className="p-2 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-125 active:scale-90 md:hidden touch-manipulation shrink-0"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                  </motion.div>
                </button>

                {/* Mobile Kiss button - beautiful floating cat icon like Snapchat bitmoji */}
                <button
                  type="button"
                  onClick={sendLoveKiss}
                  className="p-2 rounded-full hover:bg-pink-100 transition-all duration-300 hover:scale-125 active:scale-90 md:hidden touch-manipulation shrink-0"
                >
                  <motion.div
                    animate={{ rotate: [0, -8, 8, -5, 0], scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  >
                    <span className="text-2xl">😽</span>
                  </motion.div>
                </button>

                {/* Keep smiley only on desktop */}
                <button
                  type="button"
                  className="p-2.5 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110 hidden md:flex"
                >
                  <Smile className="w-5 h-5 text-rose-400" />
                </button>

                {/* Keep heart only on desktop */}
                <button
                  type="button"
                  onClick={sendLoveHeart}
                  className="p-2.5 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-125 active:scale-90 hidden md:flex"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                  </motion.div>
                </button>

                {/* Desktop Kiss button - beautiful floating cat icon like Snapchat bitmoji */}
                <button
                  type="button"
                  onClick={sendLoveKiss}
                  className="p-2.5 rounded-full hover:bg-pink-100 transition-all duration-300 hover:scale-125 active:scale-90 hidden md:flex"
                >
                  <motion.div
                    animate={{ rotate: [0, -8, 8, -5, 0], scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  >
                    <span className="text-3xl">😽</span>
                  </motion.div>
                </button>

                {/* Hidden file input for media attachment */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  onChange={handleMediaFileSelect}
                  className="hidden"
                />

                {/* Input field with camera icon (left) and image attachment icon (right) inside - mobile optimized */}
                <div className="flex-1 relative flex items-center">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="absolute left-3 z-10 p-1 rounded-full hover:bg-rose-200/50 transition-all duration-300 hover:scale-110 active:scale-90 touch-manipulation"
                  >
                    <Camera className="w-4.5 h-4.5 md:w-5 md:h-5 text-rose-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute right-3 z-20 w-10 h-10 md:w-11 md:h-11 flex items-center justify-center rounded-full hover:bg-rose-200/50 transition-all duration-300 hover:scale-110 active:scale-90 touch-manipulation"
                    aria-label="Attach image or video"
                  >
                    <ImageIcon className="w-5 h-5 md:w-6 md:h-6 text-rose-400" />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={handleInputChange}
                    placeholder="Write something sweet..."
                    className="w-full pl-12 md:pl-14 pr-16 md:pr-20 py-3 md:py-3.5 rounded-full bg-linear-to-r from-rose-100 to-pink-100 border-2 border-rose-200 focus:outline-none focus:ring-4 focus:ring-rose-300/60 focus:border-rose-400 transition-all duration-300 text-gray-700 placeholder:text-rose-300 text-sm md:text-base lg:text-lg"
                  />
                </div>

                {/* Add mic to mobile view - tightly spaced for mobile */}
                <button
                  type="button"
                  onClick={() => setIsRecording(true)}
                  className="p-2 md:p-3 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110 active:scale-90 touch-manipulation shrink-0"
                >
                  <Mic className="w-5 h-5 md:w-6 md:h-6 text-rose-500" />
                </button>

                <motion.button
                  type="submit"
                  disabled={
                    !newMessage.trim() ||
                    sendMessageMutation.isPending ||
                    isUploadingVoice
                  }
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-3 md:p-3.5 rounded-full bg-linear-to-r from-rose-500 via-pink-500 to-rose-500 hover:from-rose-600 hover:via-pink-600 hover:to-rose-600 transition-all duration-300 disabled:opacity-50 shadow-2xl shadow-rose-400/70 disabled:hover:scale-100 shrink-0 touch-manipulation"
                >
                  <Send className="w-5 h-5 md:w-5.5 md:h-5.5 text-white" />
                </motion.button>
              </>
            )}
          </form>
        </footer>

        {/* Camera Modal - Mobile Optimized */}
        <AnimatePresence>
          {isCameraOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-100 bg-black flex flex-col"
              style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              {/* Close button - safe area aware for mobile notch */}
              <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-10">
                <button
                  onClick={stopCamera}
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 active:bg-black/80 transition-colors touch-manipulation"
                >
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Video element - mobile optimized with proper viewport handling */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "flex-1 w-full h-full object-cover transition-transform duration-200",
                  isMirroredCamera && "-scale-x-100",
                )}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Capture button - safe area aware for mobile home indicators */}
              <div className="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center">
                <button
                  onClick={captureAndSendPhoto}
                  className="p-4 md:p-5 rounded-full bg-white hover:bg-gray-100 active:bg-gray-200 transition-all hover:scale-110 active:scale-95 shadow-xl touch-manipulation"
                >
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border-4 border-gray-800 bg-white" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4"
              onClick={() => setSelectedImage(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Full-size image preview"
            >
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute right-5 top-5 z-10 rounded-full bg-black/50 p-3 text-2xl leading-none text-white hover:bg-black/70"
                aria-label="Close image preview"
              >
                ×
              </button>
              <Image
                src={selectedImage}
                alt="Full-size shared image"
                width={1200}
                height={900}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                style={{ imageOrientation: "from-image" }}
                onClick={(event) => event.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
