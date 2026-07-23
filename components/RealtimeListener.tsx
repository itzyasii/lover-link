"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getSocket, updateSocketToken } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { LastMessage, useChatsStore } from "@/stores/chats";
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
  ChatLikeServerEvent,
  Message as ServerMessage,
} from "@/types/realtime-events";

// Normalize any date format to ISO string
const normalizeDate = (date: unknown): string => {
  if (typeof date === "string") return date;
  if (date instanceof Date) return date.toISOString();
  if (date && typeof date === "object" && "$date" in date) {
    const dateObj = date as { $date?: string };
    return dateObj.$date || new Date().toISOString();
  }
  return new Date().toISOString();
};

// Convert server Message format to client Message format
const normalizeMessage = (serverMessage: ServerMessage) => {
  // Create properly structured message that matches what client expects in React Query cache
  return {
    ...serverMessage,
    createdAt: normalizeDate(serverMessage.createdAt),
    updatedAt: normalizeDate(serverMessage.updatedAt),
    editedAt: serverMessage.editedAt
      ? normalizeDate(serverMessage.editedAt)
      : null,
    deletedAt: serverMessage.deletedAt
      ? normalizeDate(serverMessage.deletedAt)
      : null,
    receipts:
      serverMessage.receipts?.map((receipt) => ({
        ...receipt,
        deliveredAt: receipt.deliveredAt
          ? normalizeDate(receipt.deliveredAt)
          : undefined,
        readAt: receipt.readAt ? normalizeDate(receipt.readAt) : undefined,
        listenedAt: receipt.listenedAt
          ? normalizeDate(receipt.listenedAt)
          : undefined,
      })) || [],
  };
};

// Track processed events to prevent duplicate processing
const processedEvents = new Set<string>();
const getEventKey = (eventName: string, ...ids: string[]) =>
  `${eventName}:${ids.join(":")}`;

export function RealtimeListener() {
  const pathname = usePathname();
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
  const messageAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageSoundAtRef = useRef(0);
  const socketListenersAdded = useRef(false);

  useEffect(() => {
    const audio = new Audio("/sounds/chat_message_receive.mp3");
    audio.preload = "auto";
    audio.volume = 0.55;
    messageAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      messageAudioRef.current = null;
    };
  }, []);

  // One reusable sound avoids overlapping Audio elements during a busy conversation.
  const playMessageSound = () => {
    const now = Date.now();
    if (now - lastMessageSoundAtRef.current < 250) return;
    lastMessageSoundAtRef.current = now;

    try {
      const audio = messageAudioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      audio.play().catch((error) => {
        console.warn("[Sound] Failed to play message receive sound:", error);
      });
    } catch (error) {
      console.warn("[Sound] Could not create audio element:", error);
    }
  };

  const isViewingChat = useCallback(
    (chatId: string) => pathname?.replace(/\/$/, "") === `/app/chat/${chatId}`,
    [pathname],
  );

  useEffect(() => {
    // Only initialize socket listeners if we have valid authentication
    if (!accessToken || !user?.id) return;

    // Prevent duplicate socket listener registration
    if (socketListenersAdded.current) return;

    try {
      const socket = getSocket();
      socketListenersAdded.current = true;

      // Log connection status changes
      socket.on("connect", () => {
        console.log("[Socket] Connected successfully, socket ID:", socket.id);
      });

      socket.on("disconnect", (reason) => {
        console.log("[Socket] Disconnected. Reason:", reason);
        // Reset listener flag on disconnect to allow reinitialization
        socketListenersAdded.current = false;
      });

      // ============================================
      // Presence & Online Status Events (REALTIME_EVENTS.md)
      // ============================================

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

      // Shared message processing logic for both chat:message and share:item
      const processNewMessage = (
        chatId: string,
        serverMessage: ServerMessage,
      ) => {
        const eventKey = getEventKey("message", chatId, serverMessage.id);
        if (processedEvents.has(eventKey)) {
          return;
        }
        processedEvents.add(eventKey);

        // Cleanup old events to prevent memory leak (keep last 500 events)
        if (processedEvents.size > 500) {
          const keys = Array.from(processedEvents);
          keys.slice(0, 100).forEach((key) => processedEvents.delete(key));
        }

        const normalizedMessage = normalizeMessage(serverMessage);

        // Update React Query cache directly instead of invalidating
        queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
          if (!oldData || !Array.isArray(oldData)) {
            // If cache doesn't exist yet, return array with just this message
            return [normalizedMessage];
          }

          // Check if message already exists to prevent duplicates
          const messageExists = oldData.some((m) => m.id === serverMessage.id);
          if (messageExists) {
            return oldData;
          }

          // Add new message to cache and sort by createdAt
          return [...oldData, normalizedMessage].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });

        // Update chat store with last message
        if (serverMessage.from !== user.id) {
          // Map server message type to client's LastMessage accepted types
          const mapMessageType = (type: string): LastMessage["type"] => {
            switch (type) {
              case "event":
                return "text"; // Fallback for event types
              case "text":
              case "share":
              case "image":
              case "file":
              case "video":
              case "audio":
                return type as LastMessage["type"];
              default:
                return "text";
            }
          };

          updateChatLastMessage(chatId, {
            id: serverMessage.id,
            text:
              serverMessage.text ||
              serverMessage.item?.originalName ||
              "New message",
            from: serverMessage.from,
            createdAt: normalizedMessage.createdAt,
            type: mapMessageType(serverMessage.type),
            itemKind: serverMessage.item?.kind,
            eventKind:
              serverMessage.type === "event" ? "call_started" : undefined,
          });
          incrementUnread(chatId);

          // Play message receive sound only if user is NOT in this specific chat
          if (!isViewingChat(chatId)) {
            playMessageSound();
          }
        }
      };

      // `chat:message` - New text message received
      socket.on(
        "chat:message",
        ({ chatId, message }: ChatMessageServerEvent) => {
          processNewMessage(chatId, message);
        },
      );

      // `share:item` - New media/file share received
      socket.on("share:item", ({ chatId, message }: ShareItemServerEvent) => {
        processNewMessage(chatId, message);
      });

      // ============================================
      // Message Receipt & Status Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:receipt` - Messages were delivered or read by recipient
      socket.on(
        "chat:receipt",
        ({ type, userId, chatId, messageIds, at }: ChatReceiptServerEvent) => {
          const eventKey = getEventKey("receipt", chatId, userId, type, at);
          if (processedEvents.has(eventKey)) return;
          processedEvents.add(eventKey);

          console.log("[Socket:chat:receipt] Processing receipt:", {
            type,
            messageIds,
            userId,
          });

          if (userId !== user.id) {
            if (type === "read") {
              resetUnread(chatId);
            }

            // Update receipts in React Query cache directly
            queryClient.setQueryData(
              ["messages", chatId],
              (oldData: unknown) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;

                return oldData.map((msg) => {
                  if (messageIds.includes(msg.id)) {
                    const receiptKey =
                      type === "delivered"
                        ? "deliveredAt"
                        : type === "read"
                          ? "readAt"
                          : "listenedAt";
                    const existingReceipt = msg.receipts?.find(
                      (r: ChatReceiptServerEvent) => r.userId === userId,
                    );

                    if (existingReceipt) {
                      return {
                        ...msg,
                        receipts: msg.receipts.map(
                          (r: ChatReceiptServerEvent) =>
                            r.userId === userId
                              ? { ...r, [receiptKey]: at }
                              : r,
                        ),
                      };
                    } else {
                      return {
                        ...msg,
                        receipts: [
                          ...(msg.receipts || []),
                          { userId, [receiptKey]: at },
                        ],
                      };
                    }
                  }
                  return msg;
                });
              },
            );
          }
        },
      );

      // ============================================
      // Message Reaction Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:reaction` - A message reaction was added or removed
      socket.on(
        "chat:reaction",
        ({
          chatId,
          messageId,
          emoji,
          userId,
          action,
          at,
        }: ChatReactionServerEvent) => {
          const eventKey = getEventKey(
            "reaction",
            chatId,
            messageId,
            emoji,
            action,
            at,
          );
          if (processedEvents.has(eventKey)) return;
          processedEvents.add(eventKey);

          console.log("[Socket:chat:reaction] Processing reaction:", {
            messageId,
            emoji,
            action,
          });

          // Update reactions in React Query cache directly
          queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;

            return oldData.map((msg) => {
              if (msg.id === messageId) {
                if (action === "added") {
                  // Add reaction if not already present
                  const reactionExists = msg.reactions?.some(
                    (r: ChatReactionServerEvent) =>
                      r.emoji === emoji && r.userId === userId,
                  );
                  if (reactionExists) return msg;

                  return {
                    ...msg,
                    reactions: [
                      ...(msg.reactions || []),
                      { emoji, userId, createdAt: at },
                    ],
                  };
                } else {
                  // Remove reaction
                  return {
                    ...msg,
                    reactions: (msg.reactions || []).filter(
                      (r: ChatReactionServerEvent) =>
                        !(r.emoji === emoji && r.userId === userId),
                    ),
                  };
                }
              }
              return msg;
            });
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

      // `chat:like` - A message like was added or removed
      socket.on(
        "chat:like",
        ({ chatId, messageId, userId, action, at }: ChatLikeServerEvent) => {
          const eventKey = getEventKey(
            "like",
            chatId,
            messageId,
            userId,
            action,
            at,
          );
          if (processedEvents.has(eventKey)) return;
          processedEvents.add(eventKey);

          console.log("[Socket:chat:like] Processing like:", {
            messageId,
            action,
          });

          // Update likes in React Query cache directly
          queryClient.setQueryData(["messages", chatId], (oldData: unknown) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;

            return oldData.map((msg) => {
              if (msg.id === messageId) {
                if (action === "added") {
                  const likeExists = msg.likes?.some(
                    (l: ChatLikeServerEvent) => l.userId === userId,
                  );
                  if (likeExists) return msg;

                  return {
                    ...msg,
                    likes: [...(msg.likes || []), { userId, createdAt: at }],
                  };
                } else {
                  return {
                    ...msg,
                    likes: (msg.likes || []).filter(
                      (l: ChatLikeServerEvent) => l.userId !== userId,
                    ),
                  };
                }
              }
              return msg;
            });
          });
        },
      );

      // ============================================
      // Voice Message Specific Events (REALTIME_EVENTS.md)
      // ============================================

      // `chat:voice:listened` - A voice message was listened to
      socket.on(
        "chat:voice:listened",
        ({ chatId, messageId, userId, at }: ChatVoiceListenedServerEvent) => {
          const eventKey = getEventKey(
            "voice-listened",
            chatId,
            messageId,
            userId,
            at,
          );
          if (processedEvents.has(eventKey)) return;
          processedEvents.add(eventKey);

          if (userId !== user.id) {
            // Update listened receipt in React Query cache directly
            queryClient.setQueryData(
              ["messages", chatId],
              (oldData: unknown) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;

                return oldData.map((msg) => {
                  if (msg.id === messageId) {
                    const existingReceipt = msg.receipts?.find(
                      (r: ChatReceiptServerEvent) => r.userId === userId,
                    );
                    if (existingReceipt) {
                      return {
                        ...msg,
                        receipts: msg.receipts.map(
                          (r: ChatReceiptServerEvent) =>
                            r.userId === userId ? { ...r, listenedAt: at } : r,
                        ),
                      };
                    } else {
                      return {
                        ...msg,
                        receipts: [
                          ...(msg.receipts || []),
                          { userId, listenedAt: at },
                        ],
                      };
                    }
                  }
                  return msg;
                });
              },
            );
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
        socket.off("chat:like");

        // Clean up voice message events (REALTIME_EVENTS.md)
        socket.off("chat:voice:listened");

        clearInterval(pingInterval);
        socketListenersAdded.current = false;
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
    pathname,
    isViewingChat,
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
