"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Heart, MessageSquare, Sparkles, Flower2 } from "lucide-react";
import { useChatsStore, Chat, ChatMember, LastMessage } from "@/stores/chats";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";
import { usePresenceStore } from "@/stores/presence";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import type { ServerToClientEvents } from "@/types/realtime-events";

// Interface for raw MongoDB documents before normalization
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface MongoDBDocument<T> {
  _id?: { $oid: string };
}

interface MongoDBChatMember extends MongoDBDocument<ChatMember>, ChatMember {}
// Use Partial to make members optional to match the raw MongoDB structure
interface MongoDBChat extends MongoDBDocument<Chat>, Omit<Chat, "members"> {
  members?: MongoDBChatMember[];
}

export default function ChatsPage() {
  const { user } = useAuthStore();
  const {
    setChats,
    chats,
    updateChatLastMessage,
    incrementUnread,
    unreadCounts,
  } = useChatsStore();
  const { isSomeoneTyping } = useTypingStore();
  const { getUserPresence, fetchPresence } = usePresenceStore();

  const { isLoading, error } = useQuery<{ chats: Chat[] }>({
    queryKey: ["chats"],
    queryFn: async () => {
      const response = await apiFetch<{ ok: boolean; chats: MongoDBChat[] }>(
        "/api/chats",
      );
      if (response.ok) {
        // Normalize MongoDB ObjectIds for all chats
        const normalizedChats = response.chats.map((chat) => {
          const normalized = { ...chat };
          // Normalize chat id
          normalized.id = normalized._id?.$oid || normalized.id;
          // Normalize members
          if (normalized.members) {
            normalized.members = normalized.members.map((member) => ({
              ...member,
              id: member._id?.$oid || member.id,
            }));
          }
          // Ensure unreadCount is always a number
          normalized.unreadCount = normalized.unreadCount || 0;
          return normalized as Chat;
        });

        setChats(normalizedChats);

        // Fetch presence for all chat members to enable real-time online status
        const allMemberIds = normalizedChats.flatMap((chat) =>
          chat.members.map((member) => member.id),
        );
        // Remove duplicates and fetch presence
        const uniqueMemberIds = [...new Set(allMemberIds)];
        if (uniqueMemberIds.length > 0) {
          fetchPresence(uniqueMemberIds);
        }
        return { chats: normalizedChats };
      }
      throw new Error("Failed to fetch chats");
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // Cache for 10 minutes (React Query v5 uses gcTime instead of cacheTime)
    refetchOnReconnect: true,
  });

  // Setup socket listeners for real-time message updates
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;

    try {
      socket = getSocket();

      // Remove any existing listeners first to prevent duplicates
      socket.off("chat:message");
      socket.off("share:item");

      // Listen for new incoming messages
      const handleNewMessage: ServerToClientEvents["chat:message"] = ({
        chatId,
        message,
      }) => {
        // Convert the socket message to match LastMessage interface
        const lastMessage: LastMessage = {
          id: message.id,
          text: message.text,
          from: message.from,
          createdAt: new Date(message.createdAt).toISOString(),
          type: message.type as LastMessage["type"],
          itemKind: message.item?.kind,
        };

        // Always update the last message to ensure real-time updates work for all messages
        updateChatLastMessage(chatId, lastMessage);

        // Only increment unread count if the message is from someone else (not sent by current user)
        if (message.from !== user?.id) {
          incrementUnread(chatId);
        }
      };

      // Also handle shared items (media, files, etc.)
      const handleShareItem: ServerToClientEvents["share:item"] = ({
        chatId,
        message,
      }) => {
        // Convert the socket message to match LastMessage interface
        const lastMessage: LastMessage = {
          id: message.id,
          text: message.text,
          from: message.from,
          createdAt: new Date(message.createdAt).toISOString(),
          type: "share",
          itemKind: message.item?.kind,
        };

        // Always update the last message to ensure real-time updates work for all messages
        updateChatLastMessage(chatId, lastMessage);

        // Only increment unread count if the message is from someone else (not sent by current user)
        if (message.from !== user?.id) {
          incrementUnread(chatId);
        }
      };

      socket.on("chat:message", handleNewMessage);
      socket.on("share:item", handleShareItem);

      // Cleanup listeners on unmount
      return () => {
        if (socket) {
          socket.off("chat:message", handleNewMessage);
          socket.off("share:item", handleShareItem);
        }
      };
    } catch (err) {
      // Socket not initialized (user not authenticated), ignore
      console.log("Socket not available:", err);
      return;
    }
  }, [user?.id, updateChatLastMessage, incrementUnread]);

  if (isLoading && chats.length === 0) {
    return (
      <HeartbeatLoading fullScreen message="Loading your conversations..." />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mb-4"
        >
          <Heart className="w-10 h-10 text-rose-500" />
        </motion.div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Couldn&apos;t load chats
        </h2>
        <p className="text-gray-500 mt-2 max-w-sm">
          Please refresh the page to try again
        </p>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4"
      >
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            rotate: [0, 2, -2, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="w-32 h-32 rounded-full bg-linear-to-br from-rose-100 to-pink-100 flex items-center justify-center mb-8 shadow-xl shadow-rose-200/50"
        >
          <MessageSquare className="w-16 h-16 text-rose-500" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h2
            className="text-4xl text-gray-900 mb-4"
            style={{ fontFamily: "var(--font-windsong), cursive" }}
          >
            Begin Your Love Story
          </h2>
          <p className="text-gray-500 mt-2 max-w-md text-lg leading-relaxed">
            Connect with someone special and start your beautiful journey
            together. Add friends to begin sharing those magical moments! 💕
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Link
            href="/app/friends"
            className="mt-8 inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-rose-500 to-pink-500 text-white font-medium rounded-full hover:opacity-90 transition-all shadow-2xl shadow-rose-300/60 hover:shadow-rose-400/70 hover:scale-105 transform"
          >
            <Sparkles className="w-5 h-5" />
            Find Your Person
          </Link>
        </motion.div>

        <motion.div
          animate={{
            y: [0, -10, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
          }}
          className="absolute bottom-20 text-rose-300"
        >
          <Flower2 className="w-8 h-8" />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1
          className="text-5xl text-gray-900 mb-2"
          style={{ fontFamily: "var(--font-windsong), cursive" }}
        >
          Your Messages
        </h1>
        <p className="text-gray-500 mt-1 text-lg">
          Welcome back,{" "}
          <span className="text-rose-500 font-medium">{user?.username}</span>!
          <span className="inline-block ml-2 animate-pulse">💕</span>
        </p>
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 bg-linear-to-r from-rose-200/50 to-pink-200/50 rounded-3xl blur-xl"></div>
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-400 z-10" />
        <input
          type="text"
          placeholder="Search your conversations..."
          className="relative w-full pl-14 pr-6 py-4 bg-white/80 backdrop-blur-sm rounded-3xl border border-rose-100 focus:outline-none focus:border-rose-400 focus:bg-white transition-all shadow-lg text-gray-700 placeholder:text-gray-400"
        />
      </motion.div>

      {/* Chat List */}
      <div className="space-y-4">
        {/* Sort chats by most recent last message */}
        {[...chats]
          .sort((a, b) => {
            const dateA = a.lastMessage
              ? new Date(a.lastMessage.createdAt).getTime()
              : 0;
            const dateB = b.lastMessage
              ? new Date(b.lastMessage.createdAt).getTime()
              : 0;
            return dateB - dateA;
          })
          .map((chat, index) => {
            const otherMember = chat.members.find((m) => m.id !== user?.id);
            const isTyping = isSomeoneTyping(chat.id);
            const presence = otherMember
              ? getUserPresence(otherMember.id)
              : null;
            const isUserOnline = presence?.isOnline === true;

            return (
              <motion.div
                key={chat.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  href={`/app/chat/${chat.id}`}
                  className="block bg-white/70 backdrop-blur-sm rounded-3xl border border-rose-100/50 p-5 hover:shadow-2xl hover:shadow-rose-100/60 hover:border-rose-200 transition-all group relative overflow-hidden"
                >
                  {/* Romantic background decoration */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-rose-100/30 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>

                  <div className="flex items-center gap-5 relative z-10">
                    {/* Avatar */}
                    <div className="relative">
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="w-16 h-16 rounded-full bg-linear-to-br from-rose-400 via-pink-400 to-rose-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-rose-200"
                      >
                        {otherMember?.username?.[0]?.toUpperCase() || "?"}
                      </motion.div>
                      {isUserOnline && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-3 border-white shadow-md animate-pulse"
                        ></motion.div>
                      )}
                      {/* Tiny heart decoration on avatar */}
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center">
                        <Heart className="w-2 h-2 text-white fill-white" />
                      </div>
                    </div>

                    {/* Chat Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3
                          className="font-semibold text-gray-900 group-hover:text-rose-500 transition-colors text-xl"
                          style={{
                            fontFamily: "var(--font-windsong), cursive",
                          }}
                        >
                          {otherMember?.username || "Unknown"}
                        </h3>
                        {chat.lastMessage && (
                          <span className="text-xs text-gray-400 font-light">
                            {formatTime(chat.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <p
                          className={cn(
                            "text-sm truncate",
                            isTyping
                              ? "text-rose-500 font-medium"
                              : "text-gray-500",
                          )}
                        >
                          {isTyping ? (
                            <span className="flex items-center gap-1">
                              typing...
                              <span className="flex gap-0.5">
                                <span
                                  className="w-1 h-1 bg-rose-500 rounded-full animate-bounce"
                                  style={{ animationDelay: "0ms" }}
                                ></span>
                                <span
                                  className="w-1 h-1 bg-rose-500 rounded-full animate-bounce"
                                  style={{ animationDelay: "150ms" }}
                                ></span>
                                <span
                                  className="w-1 h-1 bg-rose-500 rounded-full animate-bounce"
                                  style={{ animationDelay: "300ms" }}
                                ></span>
                              </span>
                            </span>
                          ) : (
                            (() => {
                              if (!chat.lastMessage)
                                return "Start a beautiful conversation ✨";

                              // Handle different message types with appropriate previews
                              switch (chat.lastMessage.type) {
                                case "text":
                                  return chat.lastMessage.text;
                                case "image":
                                  return "Sent a photo";
                                case "file":
                                  return "Sent a file";
                                case "voice":
                                  return "Voice message";
                                case "share":
                                  if (chat.lastMessage.itemKind === "audio") {
                                    return "Sent an voice message";
                                  } else if (
                                    chat.lastMessage.itemKind === "video"
                                  ) {
                                    return "Sent a video";
                                  } else if (
                                    chat.lastMessage.itemKind === "image"
                                  ) {
                                    return "Sent an image";
                                  } else if (
                                    chat.lastMessage.itemKind === "link"
                                  ) {
                                    return "Sent a link";
                                  }
                                  return "Sent something";
                                default:
                                  return chat.lastMessage.text || "New message";
                              }
                            })()
                          )}
                        </p>
                        {(unreadCounts[chat.id] || 0) > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="ml-2 bg-linear-to-r from-rose-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-rose-300"
                          >
                            {unreadCounts[chat.id] || 0}
                          </motion.span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
      </div>

      {/* Romantic footer decoration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex justify-center mt-12 pb-8"
      >
        <div className="flex items-center gap-2 text-rose-300">
          <Flower2 className="w-5 h-5" />
          <span
            style={{ fontFamily: "var(--font-windsong), cursive" }}
            className="text-2xl"
          >
            Made with love
          </span>
          <Heart className="w-5 h-5 fill-current" />
          <Flower2 className="w-5 h-5" />
        </div>
      </motion.div>
    </div>
  );
}
