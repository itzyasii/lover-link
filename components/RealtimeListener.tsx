"use client";

import { useEffect } from "react";
import { getSocket, updateSocketToken } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useTypingStore } from "@/stores/typing";
import { useToastStore } from "@/stores/toast";
import { usePresenceStore } from "@/stores/presence";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ChatMessageServerEvent,
  ChatTypingServerEvent,
  ChatReceiptServerEvent,
  ChatReactionServerEvent,
  ChatVoiceListenedServerEvent,
  PresenceOnlineServerEvent,
  PresenceUpdateServerEvent,
  ShareItemServerEvent,
} from "@/types/realtime-events";

export function RealtimeListener() {
  const {
    updateChatLastMessage,
    incrementUnread,
    updateUserOnline,
    resetUnread,
  } = useChatsStore();
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

      // Add socket connection debugging
      console.log("[Socket] Initializing listeners, socket state:", {
        id: socket.id,
        connected: socket.connected,
        disconnected: socket.disconnected,
      });

      // Log all socket events for debugging
      socket.onAny((eventName, ...args) => {
        console.log(`[Socket:any] Received event "${eventName}":`, args);
      });

      // Log connection status changes
      socket.on("connect", () => {
        console.log("[Socket] Connected successfully, socket ID:", socket.id);
      });

      socket.on("disconnect", (reason) => {
        console.log("[Socket] Disconnected. Reason:", reason);
      });

      socket.on("connect_error", (error) => {
        console.error("[Socket] Connection error:", error);
      });

      // ============================================
      // Presence & Online Status Events (REALTIME_EVENTS.md)
      // ============================================

      // `presence:me` - Confirm identity and successful authentication
      socket.on("presence:me", ({ userId }) => {
        console.log("[Socket] Authenticated successfully as user:", userId);
      });

      // `presence:online` - Complete list of online users at connection time
      socket.on("presence:online", ({ users }: PresenceOnlineServerEvent) => {
        setInitialOnlineUsers(users);
        // Update chat member statuses for all online users
        users.forEach((userId) => updateUserOnline(userId, true));
      });

      // `presence:update` - Broadcast when online user list changes
      socket.on("presence:update", ({ users }: PresenceUpdateServerEvent) => {
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

      // ============================================
      // Chat Activity Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:typing` - Server -> Client: Someone started/stopped typing
      socket.on(
        "chat:typing",
        ({ chatId, from, isTyping }: ChatTypingServerEvent) => {
          // Don't track our own typing
          if (from !== user.id) {
            if (isTyping) {
              startTyping(chatId, from);
            } else {
              stopTyping(chatId, from);
            }
          }
        },
      );

      // ============================================
      // Chat Messaging Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:message` - New text message received
      socket.on(
        "chat:message",
        ({ chatId, message }: ChatMessageServerEvent) => {
          // Debug log to inspect raw message data
          console.log("[Socket:chat:message] Raw incoming message:", {
            chatId,
            message,
            createdAtType: typeof message.createdAt,
            createdAtValue: message.createdAt,
            isDate: message.createdAt instanceof Date,
            hasToISOString:
              typeof message.createdAt?.toISOString === "function",
          });

          // Properly normalize createdAt regardless of format
          let normalizedCreatedAt: string;
          if (typeof message.createdAt === "string") {
            normalizedCreatedAt = message.createdAt;
          } else if (message.createdAt instanceof Date) {
            normalizedCreatedAt = message.createdAt.toISOString();
          } else if (
            typeof message.createdAt === "object" &&
            message.createdAt !== null
          ) {
            // Handle MongoDB { $date: "..." } format
            const dateObj = message.createdAt as { $date?: string };
            if (dateObj.$date) {
              normalizedCreatedAt = dateObj.$date;
            } else {
              normalizedCreatedAt = new Date().toISOString();
              console.warn(
                "[Socket:chat:message] Could not parse createdAt, using current time:",
                message.createdAt,
              );
            }
          } else {
            normalizedCreatedAt = new Date().toISOString();
            console.warn(
              "[Socket:chat:message] Invalid createdAt type, using current time:",
              typeof message.createdAt,
              message.createdAt,
            );
          }

          console.log(
            "[Socket:chat:message] Normalized createdAt:",
            normalizedCreatedAt,
          );

          // Don't increment unread count if this message was sent by us
          if (message.from !== user.id) {
            updateChatLastMessage(chatId, {
              id: message.id,
              text: message.text || "New message",
              from: message.from,
              createdAt: normalizedCreatedAt,
              type:
                message.type === "share"
                  ? message.item?.kind || "share"
                  : "text",
              itemKind: message.item?.kind,
            });
            incrementUnread(chatId);
          }
          queryClient.invalidateQueries({
            queryKey: ["messages", chatId],
          });
        },
      );

      // `share:item` - New media/file share received
      socket.on("share:item", ({ chatId, message }: ShareItemServerEvent) => {
        // Debug log to inspect raw share message data
        console.log("[Socket:share:item] Raw incoming share message:", {
          chatId,
          message,
          createdAtType: typeof message.createdAt,
          createdAtValue: message.createdAt,
          isDate: message.createdAt instanceof Date,
        });

        // Properly normalize createdAt regardless of format
        let normalizedCreatedAt: string;
        if (typeof message.createdAt === "string") {
          normalizedCreatedAt = message.createdAt;
        } else if (message.createdAt instanceof Date) {
          normalizedCreatedAt = message.createdAt.toISOString();
        } else if (
          typeof message.createdAt === "object" &&
          message.createdAt !== null
        ) {
          // Handle MongoDB { $date: "..." } format
          const dateObj = message.createdAt as { $date?: string };
          if (dateObj.$date) {
            normalizedCreatedAt = dateObj.$date;
          } else {
            normalizedCreatedAt = new Date().toISOString();
            console.warn(
              "[Socket:share:item] Could not parse createdAt, using current time:",
              message.createdAt,
            );
          }
        } else {
          normalizedCreatedAt = new Date().toISOString();
          console.warn(
            "[Socket:share:item] Invalid createdAt type, using current time:",
            typeof message.createdAt,
            message.createdAt,
          );
        }

        console.log(
          "[Socket:share:item] Normalized createdAt:",
          normalizedCreatedAt,
        );

        if (message.from !== user.id) {
          updateChatLastMessage(chatId, {
            id: message.id,
            text: message.item?.originalName || "Shared media",
            from: message.from,
            createdAt: normalizedCreatedAt,
            type: "share",
            itemKind: message.item?.kind,
          });
          incrementUnread(chatId);
        }
        queryClient.invalidateQueries({
          queryKey: ["messages", chatId],
        });
      });

      // ============================================
      // Message Receipt & Status Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:receipt` - Messages were delivered or read by recipient
      socket.on(
        "chat:receipt",
        ({ type, userId, chatId }: ChatReceiptServerEvent) => {
          // If we sent the messages, update the UI to show they were read/delivered
          if (userId !== user.id) {
            if (type === "read") {
              resetUnread(chatId);
            }
            queryClient.invalidateQueries({
              queryKey: ["messages", chatId],
            });
          }
        },
      );

      // ============================================
      // Message Reaction Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:reaction` - A message reaction was added or removed
      socket.on(
        "chat:reaction",
        ({ chatId, emoji, userId, action }: ChatReactionServerEvent) => {
          // Refresh messages to show the updated reactions
          queryClient.invalidateQueries({
            queryKey: ["messages", chatId],
          });
          // Show a small toast if someone reacted to our message
          if (userId !== user.id && action === "added") {
            addToast(
              `Someone reacted with ${emoji} to your message!`,
              "success",
            );
          }
        },
      );

      // ============================================
      // Voice Message Specific Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:voice:listened` - A voice message was listened to
      socket.on(
        "chat:voice:listened",
        ({ chatId, userId }: ChatVoiceListenedServerEvent) => {
          if (userId !== user.id) {
            queryClient.invalidateQueries({
              queryKey: ["messages", chatId],
            });
          }
        },
      );

      // Send periodic presence pings to keep lastSeenAt updated (REALTIME_EVENTS.md)
      const pingInterval = setInterval(() => {
        socket.emit("presence:ping");
      }, 30000); // Send ping every 30 seconds as specified in docs

      return () => {
        // Clean up all presence events (REALTIME_EVENTS.md)
        socket.off("presence:me");
        socket.off("presence:online");
        socket.off("presence:update");

        // Clean up chat activity events (REALTIME_EVENTS.md)
        socket.off("chat:typing");

        // Clean up messaging events (REALTIME_EVENTS.md)
        socket.off("chat:message");
        socket.off("share:item");

        // Clean up receipt events (REALTIME_EVENTS.md)
        socket.off("chat:receipt");

        // Clean up reaction events (REALTIME_EVENTS.md)
        socket.off("chat:reaction");

        // Clean up voice message events (REALTIME_EVENTS.md)
        socket.off("chat:voice:listened");

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
    resetUnread,
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
