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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useTypingStore } from "@/stores/typing";
import { useFriendsStore } from "@/stores/friends";
import { useCall } from "@/components/call/CallProvider";
import { useToastStore } from "@/stores/toast";
import { apiFetch, apiFormData } from "@/lib/api";
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

interface Message {
  id: string;
  chatId: string;
  from: string;
  type: MessageType;
  clientMessageId?: string;
  text?: string | null;
  item?: ShareItem;
  event?: EventItem;
  reactions: Array<{ emoji: string; userId: string; createdAt: string }>;
  likes?: Array<{ userId: string; createdAt: string }>;
  receipts: Array<{
    userId: string;
    status: "delivered" | "read";
    timestamp: string;
  }>;
  linkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    url: string;
  };
  editedAt?: string;
  deletedAt?: string;
  replyTo?: {
    id: string;
    text?: string | null;
    from: string;
    fromName?: string;
  };
  createdAt: string;
  updatedAt: string;
}

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
  const [showLoveReaction, setShowLoveReaction] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastHeartEmitRef = useRef<number>(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Block check as required by CHATS_API.md
  const isBlockedEitherWay = (userId1: string, userId2: string): boolean => {
    return blockedUsers.some((b) => b.userId === userId2);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [newMessage, setNewMessage] = useState("");
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );

  // Fetch messages with pagination (CHATS_API.md: GET /chats/:chatId/messages)
  const fetchMessages = useCallback(
    async (cursor?: string) => {
      if (!chatId) return;

      const limit = 50;
      let url = `/api/chats/${chatId}/messages?limit=${limit}`;
      if (cursor) url += `&cursor=${cursor}`;

      try {
        // Debug log for API message fetch
        console.log("[Chat:fetchMessages] Fetching messages from API:", url);

        const response = await apiFetch<{
          ok: boolean;
          messages: Message[];
          nextCursor: string | null;
        }>(url);

        console.log("[Chat:fetchMessages] API response received:", {
          ok: response.ok,
          messageCount: response.messages?.length,
          firstMessage: response.messages?.[0]
            ? {
                id: response.messages[0].id,
                createdAt: response.messages[0].createdAt,
                createdAtType: typeof response.messages[0].createdAt,
              }
            : null,
        });

        if (response.ok) {
          // Normalize MongoDB ObjectIds and dates
          const normalizedMessages = response.messages.map((msg) => {
            // Debug individual message
            console.log("[Chat:fetchMessages] Processing message:", {
              id: msg.id,
              rawCreatedAt: msg.createdAt,
              rawCreatedAtType: typeof msg.createdAt,
            });

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
              console.warn(
                "[Chat:fetchMessages] Invalid createdAt format, using current time:",
                msg.createdAt,
              );
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
              id:
                (msg as unknown as { _id?: { $oid: string } })._id?.$oid ||
                msg.id,
              chatId:
                (msg as unknown as { chatId?: { $oid: string } }).chatId
                  ?.$oid || msg.chatId,
              from:
                (msg as unknown as { from?: { $oid: string } }).from?.$oid ||
                msg.from,
              likes: msg.likes || [],
              createdAt: normalizedCreatedAt,
              updatedAt: normalizedUpdatedAt,
            };
          });

          if (cursor) {
            setMessages((prev) => [...normalizedMessages, ...prev]);
          } else {
            setMessages(normalizedMessages);
          }
          setNextCursor(response.nextCursor);
          return normalizedMessages;
        }
      } catch (error) {
        console.error("[Chat] Failed to fetch messages:", error);
      }
    },
    [chatId],
  );

  // Load more messages when scrolling up
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    await fetchMessages(nextCursor);
    setIsLoadingMore(false);
  }, [nextCursor, isLoadingMore, fetchMessages]);

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
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      fetchMessages();
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      fetchMessages();
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
      console.log(`[response]`, response);
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
                      (r) => r.userId === user.id && r.status === "read",
                    );
                    return !hasReadReceipt;
                  })
                  .map((msg: Message) => msg.id);

                if (unreadMessageIds.length > 0) {
                  // First mark messages as delivered
                  socket.emit(
                    "chat:delivered",
                    { messageIds: unreadMessageIds },
                    (response) => {
                      if (response.ok) {
                        console.log(
                          `[Chat] Marked ${unreadMessageIds.length} messages as delivered`,
                        );
                      }
                    },
                  );
                  // Then mark them as read since we're actively viewing the chat
                  socket.emit(
                    "chat:read",
                    { messageIds: unreadMessageIds },
                    (response) => {
                      if (response.ok) {
                        console.log(
                          `[Chat] Marked ${unreadMessageIds.length} messages as read`,
                        );
                      }
                    },
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
    enabled: !!chatId,
  });

  // Define proper types for sending messages as per CHATS_API.md
  interface ReplyToMessage {
    id: string;
    text?: string;
    from: string;
    fromName?: string;
  }

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
    }: {
      content: string;
      replyTo?: ReplyToMessage;
    }) => {
      // Generate client-side message ID for deduplication
      const clientMessageId = crypto.randomUUID();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      setNewMessage("");
      setReplyingTo(null); // Clear reply-to after sending
    },
    onError: (error) => {
      console.error("[Chat] Failed to send message:", error);
      addToast("Failed to send message. Please try again.", "error");
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
          console.log(`[Chat] Entered chat ${chatId} successfully`);
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

      // Handle `chat:typing` events from server (REALTIME_EVENTS.md)
      const handleChatTyping = ({
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
      };

      // Handle new messages from server (REALTIME_EVENTS.md) - FIX: Update local messages state
      const handleChatMessage = ({
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

          // Normalize receipts timestamps
          const normalizedReceipts = message.receipts.map((receipt) => {
            const rawTimestamp = (
              receipt as unknown as {
                timestamp?: { $date: string } | Date | string;
              }
            ).timestamp;
            // Handle MongoDB {$date: "iso-string"} format
            if (
              rawTimestamp &&
              typeof rawTimestamp === "object" &&
              "$date" in rawTimestamp
            ) {
              return {
                userId: receipt.userId,
                status:
                  receipt.status === "listened"
                    ? "read"
                    : (receipt.status as "delivered" | "read"),
                timestamp: rawTimestamp.$date,
              };
            }
            // Handle Date object
            if (
              rawTimestamp !== null &&
              typeof rawTimestamp === "object" &&
              "toISOString" in rawTimestamp
            ) {
              return {
                userId: receipt.userId,
                status:
                  receipt.status === "listened"
                    ? "read"
                    : (receipt.status as "delivered" | "read"),
                timestamp: (rawTimestamp as Date).toISOString(),
              };
            }
            // Already a string
            return {
              userId: receipt.userId,
              status:
                receipt.status === "listened"
                  ? "read"
                  : (receipt.status as "delivered" | "read"),
              timestamp: rawTimestamp as string,
            };
          });

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

          // Add new message to local state so it appears immediately
          setMessages((prev) => [...prev, normalizedMessage]);
        }
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      };

      // Handle message receipts (REALTIME_EVENTS.md)
      const handleChatReceipt = () => {
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      };

      // Handle message reactions (REALTIME_EVENTS.md)
      const handleChatReaction = () => {
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      };

      // Handle message like event (REALTIME_EVENTS.md)
      const handleChatLike = (data: unknown) => {
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
          // Update local messages state
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === messageId) {
                const currentLikes = msg.likes || [];
                if (action === "added") {
                  return {
                    ...msg,
                    likes: [
                      ...currentLikes.filter((l) => l.userId !== userId),
                      { userId, createdAt: at },
                    ],
                  };
                } else {
                  return {
                    ...msg,
                    likes: currentLikes.filter((l) => l.userId !== userId),
                  };
                }
              }
              return msg;
            }),
          );
          queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        }
      };

      // Handle message edited event (REALTIME_EVENTS.md)
      const handleMessageEdited = ({
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
          // Update local messages state
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId ? { ...msg, text, editedAt: editedAt } : msg,
            ),
          );
          queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        }
      };

      // Handle message deleted event (REALTIME_EVENTS.md)
      const handleMessageDeleted = ({
        chatId: eventChatId,
        messageId,
        deletedAt,
      }: {
        chatId: string;
        messageId: string;
        deletedAt: string;
      }) => {
        if (eventChatId === chatId) {
          // Update local messages state (soft delete - mark as deleted)
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, deletedAt: deletedAt, text: null }
                : msg,
            ),
          );
          queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        }
      };

      // Register only official events from REALTIME_EVENTS.md
      socket.on("chat:typing", handleChatTyping);
      socket.on("chat:message", handleChatMessage);
      socket.on("share:item", handleChatMessage);
      socket.on("chat:receipt", handleChatReceipt);
      socket.on("chat:reaction", handleChatReaction);
      socket.on("chat:like", handleChatLike);
      socket.on("chat:message:edited", handleMessageEdited);
      socket.on("chat:message:deleted", handleMessageDeleted);

      socket.on("chat:heart", (data) => {
        if (data.from !== user?.id && data.chatId === chatId) {
          const id = crypto.randomUUID();
          const x = 50 + Math.random() * 100;
          const y = window.innerHeight - 100 - Math.random() * 50;
          setMessageHearts((prev) => [...prev, { id, x, y }].slice(-10));
          setTimeout(() => {
            setMessageHearts((prev) => prev.filter((h) => h.id !== id));
          }, 2000);
        }
      });

      return () => {
        clearInterval(chatPingInterval);
        socket.off("chat:typing", handleChatTyping);
        socket.off("chat:message", handleChatMessage);
        socket.off("share:item", handleChatMessage);
        socket.off("chat:receipt", handleChatReceipt);
        socket.off("chat:reaction", handleChatReaction);
        socket.off("chat:like", handleChatLike);
        socket.off("chat:message:edited", handleMessageEdited);
        socket.off("chat:message:deleted", handleMessageDeleted);
        socket.off("chat:heart");
        // `chat:leave` - Client → Server: Notify server we've left the chat (REALTIME_EVENTS.md)
        socket.emit("chat:leave", { chatId: chatId }, (response) => {
          if (response.ok) {
            console.log(`[Chat] Left chat ${chatId} successfully`);
          }
        });
      };
    } catch (error) {
      console.error("[Chat] Failed to initialize socket:", error);
    }
  }, [chatId, user?.id, queryClient, startTyping, stopTyping]);

  // Initial fetch of messages
  useEffect(() => {
    // Use async IIFE to avoid calling setState synchronously in effect body
    (async () => {
      await fetchMessages();
    })();
  }, [fetchMessages]);

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
            (response) => {
              if (response.ok) {
                // Stop typing status sent successfully
              }
            },
          );
        }, 2000);
        setTypingTimeout(timeout);
      }
    } catch (error) {
      console.error("[Chat] Failed to emit typing event:", error);
    }
  };

  const handleSendVoiceNote = async (blob: Blob, duration: number) => {
    if (!chatId || !user?.id) return;

    setIsRecording(false);
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
    }
  };

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
            (response) => {
              if (response.ok) {
                // Stop typing status sent successfully
              }
            },
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
      replyToData = {
        id: replyingTo.id,
        text: replyingTo.text ?? undefined,
        from: replyingTo.from,
        fromName:
          replyingTo.from === user?.id
            ? user?.username
            : otherParticipant.username,
      };
    }

    sendMessageMutation.mutate({
      content: newMessage.trim(),
      replyTo: replyToData,
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
        ].slice(-10),
      );

      // Remove after animation completes
      setTimeout(() => {
        setMessageHearts((prev) => prev.filter((h) => h.id !== id));
      }, 2000);

      const socket = getSocket();
      const now = Date.now();
      if (socket && chatId && now - lastHeartEmitRef.current > 100) {
        socket.emit("chat:heart", { chatId }, () => {});
        lastHeartEmitRef.current = now;
      }
    },
    [chatId],
  );

  // Double tap/click to send love reaction
  const handleMessageDoubleClick = useCallback(
    (messageId: string, e: React.MouseEvent) => {
      e.preventDefault();
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

      // Optimistic update
      if (user?.id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === messageId) {
              const currentLikes = m.likes || [];
              const hasLiked = currentLikes.some((l) => l.userId === user.id);
              return {
                ...m,
                likes: hasLiked
                  ? currentLikes.filter((l) => l.userId !== user.id)
                  : [
                      ...currentLikes,
                      { userId: user.id, createdAt: new Date().toISOString() },
                    ],
              };
            }
            return m;
          }),
        );
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
    [user?.id],
  );

  if (isLoading || !chat) {
    return <HeartbeatLoading message="Loading conversation..." />;
  }

  return (
    <div className="h-[calc(100vh-2rem)] lg:h-[calc(100vh-2rem)] w-full flex flex-col relative overflow-hidden bg-linear-to-br from-rose-100 via-pink-50 to-rose-100 rounded-2xl">
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

      {/* Spectacular romantic floating hearts burst */}
      <AnimatePresence>
        {messageHearts.map((mh) => (
          <motion.div
            key={mh.id}
            className="fixed pointer-events-none z-100 -translate-x-1/2 -translate-y-1/2"
            style={{ left: mh.x, top: mh.y }}
          >
            {/* Main soaring heart */}
            <motion.div
              initial={{ y: 0, scale: 0.5, opacity: 0 }}
              animate={{
                y: -500,
                scale: [1, 2.5, 3, 2.5],
                rotate: [-15, 15, -15, 10, 0],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 3.5, ease: "easeOut" }}
              className="relative flex items-center justify-center"
            >
              <Heart className="w-20 h-20 text-rose-500 fill-rose-500 drop-shadow-[0_0_25px_rgba(244,63,94,0.9)]" />

              {/* Confetti mini-hearts exploding outward */}
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos((i * 45 * Math.PI) / 180) * 120,
                    y:
                      Math.sin((i * 45 * Math.PI) / 180) * 120 -
                      Math.random() * 100,
                    scale: Math.random() * 1.5 + 0.5,
                    rotate: Math.random() * 360,
                    opacity: 0,
                  }}
                  transition={{ duration: 2 + Math.random(), ease: "easeOut" }}
                  className="absolute"
                >
                  <Heart
                    className={cn(
                      "w-6 h-6 drop-shadow-lg",
                      i % 2 === 0
                        ? "text-pink-400 fill-pink-400"
                        : "text-rose-400 fill-rose-400",
                    )}
                  />
                </motion.div>
              ))}

              {/* Shimmering sparkles */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={`sparkle-${i}`}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{
                    x: Math.cos(((i * 60 + 30) * Math.PI) / 180) * 90,
                    y: Math.sin(((i * 60 + 30) * Math.PI) / 180) * 90 - 50,
                    scale: [0, 1.5, 0],
                    rotate: 180,
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1.5 + Math.random(),
                    ease: "easeInOut",
                    delay: 0.2,
                  }}
                  className="absolute"
                >
                  <Sparkles className="w-7 h-7 text-yellow-300 drop-shadow-lg" />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Enhanced Romantic Header with glassmorphism */}
      <header className="relative z-20 w-full bg-linear-to-r from-rose-400/95 via-pink-400/95 to-rose-400/95 backdrop-blur-2xl border-b border-rose-200/60 p-3 md:p-3 shadow-2xl shadow-rose-300/60 shrink-0">
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

        <div className="max-w-4xl mx-auto flex items-center gap-3 relative">
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
            <div className="w-12 h-12 md:w-20 md:h-20 rounded-full bg-linear-to-br from-white to-rose-100 flex items-center justify-center shadow-2xl shadow-rose-300/60 ring-4 ring-white/60">
              <span className="bg-linear-to-br from-rose-500 to-pink-500 bg-clip-text text-transparent font-bold text-1xl md:text-2xl">
                {otherParticipant?.username?.[0]?.toUpperCase()}
              </span>
            </div>
            {isUserOnline && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute bottom-1 right-1 w-4 h-4 md:w-5 md:h-5 bg-green-400 rounded-full border-4 border-white shadow-xl"
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
              className="absolute -top-3 -right-3"
            >
              <Heart className="w-7 h-7 md:w-8 md:h-8 text-rose-300 fill-rose-300 drop-shadow-lg" />
            </motion.div>
          </motion.div>

          <div className="flex-1">
            <motion.h2
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="font-bold text-white text-xl drop-shadow-md"
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
                  Online • {otherParticipant?.username}
                </span>
              ) : (
                <span className="text-white/70">Last seen recently</span>
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
            className="p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
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
            className="p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
          >
            <Video className="w-5 h-5 text-white" />
          </button>

          {/* Chat actions menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-3 rounded-full hover:bg-white/20 transition-all duration-300 hover:scale-110 backdrop-blur-sm"
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
              message.text?.toLowerCase().includes("❤");
            const isShowingLove = showLoveReaction === message.id;
            const isEditing = editingMessageId === message.id;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                onDoubleClick={(e) => handleMessageDoubleClick(message.id, e)}
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
                    isLoveMessage && "ring-4 ring-yellow-300/70",
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
                      className={cn(
                        "absolute -top-10 flex gap-1.5 opacity-0 group-hover/message:opacity-100 transition-all duration-200 z-10",
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
                      <p className="text-sm leading-relaxed line-clamp-2">
                        {message.replyTo.text || "Media message"}
                      </p>
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
                    message.item?.kind === "audio" ? (
                    <VoiceNotePlayer
                      audioUrl={message.item.url}
                      duration={
                        message.item.meta?.duration as number | undefined
                      }
                      messageId={message.id}
                      isOwn={isOwn}
                      isListened={message.receipts?.some(
                        (r) => r.userId === user?.id && r.status === "read",
                      )}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed">{message.text}</p>
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
                                  {message.likes.map((like, index) => {
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
                          message.receipts?.some(
                            (r) => r.status === "read",
                          ) && (
                            <motion.span
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <Heart className="w-3.5 h-3.5 fill-current text-rose-200" />
                            </motion.span>
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
            animate={{ x: [0, 15, 0], y: [0, -5, 0], opacity: [0.3, 0.6, 0.3] }}
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
                  <p className="text-sm text-gray-700 truncate max-w-md">
                    {replyingTo.text || "Media message"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
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
          className="max-w-4xl mx-auto flex items-center gap-2 relative"
        >
          {isRecording ? (
            <AudioRecorderUI
              onSend={handleSendVoiceNote}
              onCancel={() => setIsRecording(false)}
            />
          ) : (
            <>
              <button
                type="button"
                className="p-2.5 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110"
              >
                <Smile className="w-5 h-5 text-rose-400" />
              </button>

              <button
                type="button"
                onClick={sendLoveHeart}
                className="p-2.5 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-125 active:scale-90"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                </motion.div>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={handleInputChange}
                placeholder="Write something sweet..."
                className="flex-1 px-5 py-3 md:py-3.5 rounded-full bg-linear-to-r from-rose-100 to-pink-100 border-2 border-rose-200 focus:outline-none focus:ring-4 focus:ring-rose-300/60 focus:border-rose-400 transition-all duration-300 text-gray-700 placeholder:text-rose-300 text-base md:text-lg"
              />

              <button
                type="button"
                onClick={() => setIsRecording(true)}
                className="p-2.5 md:p-3 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110"
              >
                <Mic className="w-5 h-5 md:w-5.5 md:h-5.5 text-rose-400" />
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
                className="p-3 md:p-3.5 rounded-full bg-linear-to-r from-rose-500 via-pink-500 to-rose-500 hover:from-rose-600 hover:via-pink-600 hover:to-rose-600 transition-all duration-300 disabled:opacity-50 shadow-2xl shadow-rose-400/70 disabled:hover:scale-100"
              >
                <Send className="w-5 h-5 md:w-5.5 md:h-5.5 text-white" />
              </motion.button>
            </>
          )}
        </form>
      </footer>
    </div>
  );
}
