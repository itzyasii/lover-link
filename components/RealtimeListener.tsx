"use client";

import { useEffect } from "react";
import { getSocket, updateSocketToken } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useTypingStore } from "@/stores/typing";
import { useToastStore } from "@/stores/toast";
import { usePresenceStore } from "@/stores/presence";
import { useQueryClient } from "@tanstack/react-query";

export function RealtimeListener() {
  const { updateChatLastMessage, incrementUnread, updateUserOnline } =
    useChatsStore();
  const { startTyping, stopTyping } = useTypingStore();
  const { addToast } = useToastStore();
  const { setInitialOnlineUsers, updatePresence } = usePresenceStore();
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only initialize socket listeners if we have valid authentication
    if (!accessToken || !user?.id) return;

    try {
      const socket = getSocket();

      // Handle presence events from USERS-FRIENDS-REALTIME-GUIDE
      socket.on("presence:online", ({ users }: { users: string[] }) => {
        setInitialOnlineUsers(users);
        // Update chat member statuses for all online users
        users.forEach((userId) => updateUserOnline(userId, true));
      });

      socket.on("presence:update", ({ users }: { users: string[] }) => {
        updatePresence(users);
        // Update chat member statuses to reflect new presence state
        const currentOnline = usePresenceStore.getState().getOnlineUsers();
        const allKnownUsers = Array.from(
          usePresenceStore.getState().onlineUsers.keys(),
        );

        allKnownUsers.forEach((userId) => {
          const isNowOnline = currentOnline.includes(userId);
          updateUserOnline(userId, isNowOnline);
        });
      });

      // Keep existing legacy events for backward compatibility
      socket.on("user_online", ({ userId }: { userId: string }) => {
        updateUserOnline(userId, true);
      });

      socket.on("user_offline", ({ userId }: { userId: string }) => {
        updateUserOnline(userId, false);
      });

      interface NewMessage {
        id: string;
        chatId: string;
        text?: string;
        from: string;
        createdAt: string;
        type?: "text" | "image" | "file" | "voice";
      }

      socket.on("new_message", (message: NewMessage) => {
        updateChatLastMessage(message.chatId, {
          id: message.id,
          text: message.text || "New message",
          from: message.from,
          createdAt: message.createdAt,
          type: message.type || "text",
        });
        incrementUnread(message.chatId);
        queryClient.invalidateQueries({
          queryKey: ["messages", message.chatId],
        });
      });

      socket.on(
        "typing_start",
        ({ chatId, userId }: { chatId: string; userId: string }) => {
          startTyping(chatId, userId);
        },
      );

      socket.on(
        "typing_stop",
        ({ chatId, userId }: { chatId: string; userId: string }) => {
          stopTyping(chatId, userId);
        },
      );

      socket.on("incoming_call", ({ isVideo }: { isVideo: boolean }) => {
        addToast(`Incoming ${isVideo ? "video" : "voice"} call!`, "info");
      });

      // Friend request real-time events from USERS-FRIENDS-REALTIME-GUIDE
      socket.on(
        "friend_request:received",
        ({ username }: { username: string }) => {
          addToast(`${username} sent you a friend request! 💌`, "success");
          // Invalidate and refetch pending requests
          queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
        },
      );

      socket.on(
        "friend_request:accepted",
        ({ username }: { username: string }) => {
          addToast(`${username} accepted your friend request! 💑`, "success");
          queryClient.invalidateQueries({ queryKey: ["friends"] });
          queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
        },
      );

      socket.on(
        "friend_request:rejected",
        ({ username }: { username: string }) => {
          addToast(`${username} rejected your friend request`, "info");
          queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
        },
      );

      socket.on("friend:unfriended", ({ username }: { username: string }) => {
        addToast(`${username} is no longer your friend`, "info");
        queryClient.invalidateQueries({ queryKey: ["friends"] });
      });

      // Send periodic presence pings to keep lastSeenAt updated
      const pingInterval = setInterval(() => {
        socket.emit("presence:ping");
      }, 30000); // Send ping every 30 seconds

      return () => {
        socket.off("presence:online");
        socket.off("presence:update");
        socket.off("new_message");
        socket.off("typing_start");
        socket.off("typing_stop");
        socket.off("user_online");
        socket.off("user_offline");
        socket.off("incoming_call");
        // Clean up all friend-related socket events
        socket.off("friend_request:received");
        socket.off("friend_request:accepted");
        socket.off("friend_request:rejected");
        socket.off("friend:unfriended");
        clearInterval(pingInterval);
      };
    } catch (error) {
      console.error(
        "[Socket] Failed to initialize in RealtimeListener:",
        error,
      );
    }
  }, [
    updateChatLastMessage,
    incrementUnread,
    startTyping,
    stopTyping,
    updateUserOnline,
    setInitialOnlineUsers,
    updatePresence,
    addToast,
    queryClient,
    accessToken,
    user?.id,
  ]);

  // Update socket auth when accessToken or user changes
  useEffect(() => {
    if (accessToken && user?.id) {
      try {
        updateSocketToken(accessToken);
      } catch (error) {
        console.error("[Socket] Failed to update token:", error);
      }
    }
  }, [accessToken, user?.id]);

  return null;
}
