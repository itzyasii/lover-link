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
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { formatTime } from "@/lib/utils";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { cn } from "@/lib/utils";

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
  text?: string;
  item?: ShareItem;
  event?: EventItem;
  reactions: Array<{ emoji: string; userId: string; createdAt: string }>;
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
    text?: string;
    from: string;
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
  const { markAsRead } = useChatsStore();
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

  // Block check as required by CALLS-MESSAGES-NOTIFICATIONS-GUIDE
  const isBlockedEitherWay = (userId1: string, userId2: string): boolean => {
    return blockedUsers.some((b) => b.userId === userId2);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [newMessage, setNewMessage] = useState("");
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );

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

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // Generate client-side message ID for deduplication
      const clientMessageId = crypto.randomUUID();

      const response = await apiFetch<{ ok: boolean }>(
        `/api/chats/${chatId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "text",
            text: content,
            clientMessageId,
          }),
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
    },
    onError: (error) => {
      console.error("[Chat] Failed to send message:", error);
      addToast("Failed to send message. Please try again.", "error");
    },
  });

  // Get store state to track real-time online status updates
  const storeChats = useChatsStore((state) => state.chats);
  const currentStoreChat = storeChats.find((c) => c.id === chatId);
  const storeOtherParticipant = currentStoreChat?.members?.find(
    (p) => p.id !== user?.id,
  );

  // Use store participant if available (has real-time online status), otherwise fall back to query data
  const otherParticipant =
    storeOtherParticipant || chat?.members?.find((p) => p.id !== user?.id);
  const isTyping = useTypingStore((state) => state.isSomeoneTyping(chatId));

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

      // Handle new messages from server (REALTIME_EVENTS.md)
      const handleChatMessage = () => {
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

      // Register only official events from REALTIME_EVENTS.md
      socket.on("chat:typing", handleChatTyping);
      socket.on("chat:message", handleChatMessage);
      socket.on("share:item", handleChatMessage);
      socket.on("chat:receipt", handleChatReceipt);
      socket.on("chat:reaction", handleChatReaction);

      return () => {
        clearInterval(chatPingInterval);
        socket.off("chat:typing", handleChatTyping);
        socket.off("chat:message", handleChatMessage);
        socket.off("share:item", handleChatMessage);
        socket.off("chat:receipt", handleChatReceipt);
        socket.off("chat:reaction", handleChatReaction);
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

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

    sendMessageMutation.mutate(newMessage.trim());
  };

  // Function to send a floating love heart
  const sendLoveHeart = useCallback((e: React.MouseEvent) => {
    const id = crypto.randomUUID();
    setMessageHearts((prev) => [
      ...prev,
      {
        id,
        x: e.clientX,
        y: e.clientY,
      },
    ]);

    // Remove after animation completes
    setTimeout(() => {
      setMessageHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  }, []);

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
    },
    [],
  );

  if (isLoading || !chat) {
    return <HeartbeatLoading message="Loading conversation..." />;
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col relative overflow-hidden bg-linear-to-br from-rose-100 via-pink-50 to-rose-100">
      {/* Animated background hearts */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {hearts.map((heart) => (
          <FloatingHeart key={heart.id} delay={heart.delay} x={heart.x} />
        ))}
      </div>

      {/* Clicked floating hearts */}
      <AnimatePresence>
        {messageHearts.map((mh) => (
          <motion.div
            key={mh.id}
            initial={{ y: 0, scale: 0, opacity: 1 }}
            animate={{ y: -200, scale: 2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="fixed pointer-events-none z-50"
            style={{ left: mh.x, top: mh.y }}
          >
            <Heart className="w-12 h-12 text-rose-500 fill-rose-500 drop-shadow-lg" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Romantic Header */}
      <header className="relative z-10 bg-linear-to-r from-rose-400/90 via-pink-400/90 to-rose-400/90 backdrop-blur-xl border-b border-rose-200/50 p-4 shadow-lg shadow-rose-200/50">
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

        <div className="max-w-4xl mx-auto flex items-center gap-4 relative">
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
            <div className="w-16 h-16 rounded-full bg-linear-to-br from-white to-rose-100 flex items-center justify-center shadow-xl shadow-rose-300/50 ring-4 ring-white/50">
              <span className="bg-linear-to-br from-rose-500 to-pink-500 bg-clip-text text-transparent font-bold text-2xl">
                {otherParticipant?.username?.[0]?.toUpperCase()}
              </span>
            </div>
            {otherParticipant?.isOnline && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute bottom-1 right-1 w-4 h-4 bg-green-400 rounded-full border-3 border-white shadow-lg"
              >
                <motion.div
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-full h-full bg-green-400 rounded-full"
                />
              </motion.div>
            )}
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -top-2 -right-2"
            >
              <Heart className="w-6 h-6 text-rose-300 fill-rose-300 drop-shadow-md" />
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
              ) : otherParticipant?.isOnline === true ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                  Together Online ♥
                </span>
              ) : otherParticipant?.isOnline === false ? (
                <span className="text-white/70">Last seen recently</span>
              ) : (
                <span className="text-white/70">
                  Connected • {otherParticipant?.username}
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
        </div>
      </header>

      {/* Romantic Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Date separator */}
          {chat.messages && chat.messages.length > 0 && (
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

          {chat.messages?.map((message, index) => {
            const isOwn = message.from === user?.id;
            const showAvatar =
              index === 0 || chat.messages?.[index - 1]?.from !== message.from;
            const isLoveMessage =
              message.text?.toLowerCase().includes("love") ||
              message.text?.toLowerCase().includes("❤");
            const isShowingLove = showLoveReaction === message.id;

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
                    "max-w-xs sm:max-w-md lg:max-w-lg px-5 py-3 rounded-3xl relative overflow-hidden",
                    isOwn
                      ? "bg-linear-to-r from-rose-500 via-pink-500 to-rose-500 text-white rounded-br-lg shadow-xl shadow-rose-300/70"
                      : "bg-white/90 backdrop-blur-sm text-gray-800 rounded-bl-lg shadow-lg shadow-pink-200/50 border border-rose-100/50",
                    isLoveMessage && "ring-2 ring-yellow-300",
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

                  <p className="text-sm leading-relaxed">{message.text}</p>
                  <p
                    className={cn(
                      "text-xs mt-2 flex items-center gap-1",
                      isOwn ? "text-rose-100" : "text-gray-400",
                    )}
                  >
                    {formatTime(message.createdAt)}
                    {isOwn &&
                      message.receipts?.some((r) => r.status === "read") && (
                        <motion.span
                          animate={{ scale: [1, 1.3, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <Heart className="w-3.5 h-3.5 fill-current text-rose-200" />
                        </motion.span>
                      )}
                  </p>
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

      {/* Romantic Message Input */}
      <footer className="relative z-10 bg-linear-to-r from-white/95 via-rose-50/95 to-white/95 backdrop-blur-xl border-t border-rose-200/60 p-4 shadow-2xl">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ x: [0, 10, 0], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute bottom-2 left-4"
          >
            <Heart className="w-8 h-8 text-rose-200 fill-rose-200" />
          </motion.div>
          <motion.div
            animate={{ x: [0, -10, 0], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 5, repeat: Infinity, delay: 2 }}
            className="absolute bottom-2 right-4"
          >
            <Heart className="w-6 h-6 text-pink-200 fill-pink-200" />
          </motion.div>
        </div>

        <form
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex items-center gap-3 relative"
        >
          <button
            type="button"
            className="p-3 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110"
          >
            <Smile className="w-5 h-5 text-rose-400" />
          </button>

          <button
            type="button"
            onClick={sendLoveHeart}
            className="p-3 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-125 active:scale-90"
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
            className="flex-1 px-6 py-3.5 rounded-full bg-linear-to-r from-rose-100 to-pink-100 border-2 border-rose-200 focus:outline-none focus:ring-4 focus:ring-rose-300/50 focus:border-rose-400 transition-all duration-300 text-gray-700 placeholder:text-rose-300"
          />

          <button
            type="button"
            className="p-3 rounded-full hover:bg-rose-100 transition-all duration-300 hover:scale-110"
          >
            <Mic className="w-5 h-5 text-rose-400" />
          </button>

          <motion.button
            type="submit"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-4 rounded-full bg-linear-to-r from-rose-500 via-pink-500 to-rose-500 hover:from-rose-600 hover:via-pink-600 hover:to-rose-600 transition-all duration-300 disabled:opacity-50 shadow-xl shadow-rose-400/60 disabled:hover:scale-100"
          >
            <Send className="w-5 h-5 text-white" />
          </motion.button>
        </form>
      </footer>
    </div>
  );
}
