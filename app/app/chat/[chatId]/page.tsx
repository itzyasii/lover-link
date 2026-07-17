"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Phone, Video, ArrowLeft, Smile, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useTypingStore } from "@/stores/typing";
import { useCall } from "@/components/call/CallProvider";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { formatTime } from "@/lib/utils";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

interface ChatDetails {
  id: string;
  participants?: { id: string; username: string; isOnline: boolean }[];
  messages?: Message[];
}

export default function ChatRoomPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { markAsRead } = useChatsStore();
  const { startTyping, stopTyping } = useTypingStore();
  const { initiateCall } = useCall();
  const queryClient = useQueryClient();
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
      if (response.ok) {
        markAsRead(chatId);
        return response.chat;
      }
      throw new Error("Failed to load chat");
    },
    enabled: !!chatId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiFetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      setNewMessage("");
    },
  });

  const otherParticipant = chat?.participants?.find((p) => p.id !== user?.id);
  const isTyping = useTypingStore((state) => state.isSomeoneTyping(chatId));

  // Socket event listeners
  useEffect(() => {
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id || !chatId) return;

    try {
      const socket = getSocket();
      if (!socket) return;

      socket.emit("join_chat", { chatId: chatId });

      const handleNewMessage = () => {
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      };

      const handleUserTyping = ({ userId }: { userId: string }) => {
        if (userId !== user?.id) {
          startTyping(chatId, userId);
        }
      };

      const handleUserStopTyping = ({ userId }: { userId: string }) => {
        if (userId !== user?.id) {
          stopTyping(chatId, userId);
        }
      };

      socket.on("new_message", handleNewMessage);
      socket.on("user_typing", handleUserTyping);
      socket.on("user_stop_typing", handleUserStopTyping);

      return () => {
        socket.off("new_message", handleNewMessage);
        socket.off("user_typing", handleUserTyping);
        socket.off("user_stop_typing", handleUserStopTyping);
        socket.emit("leave_chat", { chatId: chatId });
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

    // Emit typing event
    const { accessToken, user } = useAuthStore.getState();
    if (!accessToken || !user?.id || !chatId) return;

    try {
      const socket = getSocket();
      if (socket && chatId) {
        socket.emit("typing", { chatId: chatId });

        // Clear previous timeout
        if (typingTimeout) clearTimeout(typingTimeout);

        // Set new timeout to emit stop typing after 2s of inactivity
        const timeout = setTimeout(() => {
          socket.emit("stop_typing", { chatId: chatId });
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

    // Emit stop typing before sending
    const { accessToken, user } = useAuthStore.getState();
    if (accessToken && user?.id && chatId) {
      try {
        const socket = getSocket();
        if (socket) {
          socket.emit("stop_typing", { chatId: chatId });
        }
      } catch (error) {
        console.error("[Chat] Failed to emit stop typing event:", error);
      }
    }
    if (typingTimeout) clearTimeout(typingTimeout);

    sendMessageMutation.mutate(newMessage.trim());
  };

  if (isLoading || !chat) {
    return <HeartbeatLoading message="Loading conversation..." />;
  }

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col bg-linear-to-br from-rose-50 to-pink-50">
      {/* Chat Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-rose-100 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-rose-100 transition-colors lg:hidden"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>

          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white font-bold">
              {otherParticipant?.username?.[0]?.toUpperCase()}
            </div>
            {otherParticipant?.isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
            )}
          </div>

          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">
              {otherParticipant?.username}
            </h2>
            <p className="text-sm text-gray-500">
              {isTyping ? (
                <span className="text-rose-500">typing...</span>
              ) : otherParticipant?.isOnline ? (
                "Online"
              ) : (
                "Offline"
              )}
            </p>
          </div>

          <button
            onClick={() =>
              otherParticipant?.id && initiateCall(otherParticipant.id, "audio")
            }
            className="p-2 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <Phone className="w-5 h-5 text-rose-500" />
          </button>
          <button
            onClick={() =>
              otherParticipant?.id && initiateCall(otherParticipant.id, "video")
            }
            className="p-2 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <Video className="w-5 h-5 text-rose-500" />
          </button>
        </div>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {chat.messages?.map((message, index) => {
            const isOwn = message.senderId === user?.id;
            const showAvatar =
              index === 0 ||
              chat.messages?.[index - 1]?.senderId !== message.senderId;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-end gap-2",
                  isOwn ? "flex-row-reverse" : "flex-row",
                )}
              >
                {showAvatar && !isOwn ? (
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {otherParticipant?.username?.[0]?.toUpperCase()}
                  </div>
                ) : !isOwn ? (
                  <div className="w-8" />
                ) : null}

                <div
                  className={cn(
                    "max-w-xs sm:max-w-md lg:max-w-lg px-4 py-2 rounded-2xl",
                    isOwn
                      ? "bg-linear-to-r from-rose-500 to-pink-500 text-white rounded-br-md"
                      : "bg-white text-gray-900 rounded-bl-md shadow-sm",
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={cn(
                      "text-xs mt-1",
                      isOwn ? "text-rose-100" : "text-gray-400",
                    )}
                  >
                    {formatTime(message.createdAt)}
                    {isOwn && message.read && " ✓✓"}
                  </p>
                </div>

                {showAvatar && isOwn ? (
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-400 to-indigo-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {user?.username?.[0]?.toUpperCase()}
                  </div>
                ) : isOwn ? (
                  <div className="w-8" />
                ) : null}
              </motion.div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <footer className="bg-white/80 backdrop-blur-lg border-t border-rose-100 p-4">
        <form
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex items-center gap-3"
        >
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <Smile className="w-5 h-5 text-gray-500" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-rose-100 transition-colors"
          >
            <Mic className="w-5 h-5 text-gray-500" />
          </button>
          <button
            type="submit"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
            className="p-2 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </form>
      </footer>
    </div>
  );
}
