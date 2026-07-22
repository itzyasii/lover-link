"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ChatMember {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeenAt?: string;
}

export interface LastMessage {
  id: string;
  text: string | null;
  from: string;
  createdAt: string;
  type: "text" | "image" | "file" | "voice" | "share" | "video" | "audio";
  itemKind?: string | null;
  eventKind?: string | null;
  eventMedia?: string | null;
}

export interface Chat {
  id: string;
  type: "dm";
  members: ChatMember[];
  lastMessage?: LastMessage | null;
  isPinned?: boolean;
  isMuted?: boolean;
  unreadCount: number;
  updatedAt: string;
  createdAt?: string;
}

interface ChatsState {
  chats: Chat[];
  unreadCounts: Record<string, number>;
}

interface ChatsActions {
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChatLastMessage: (chatId: string, message: LastMessage) => void;
  incrementUnread: (chatId: string) => void;
  resetUnread: (chatId: string) => void;
  markAsRead: (chatId: string) => void;
  togglePin: (chatId: string) => void;
  toggleMute: (chatId: string) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  removeChat: (chatId: string) => void;
  getTotalUnread: () => number;
  updateUserOnline: (userId: string, isOnline: boolean) => void;
}

const initialState: ChatsState = {
  chats: [],
  unreadCounts: {},
};

export const useChatsStore = create<ChatsState & ChatsActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setChats: (chats: Chat[]) => {
        // When setting chats from server, synchronize unread counts
        // This ensures server state takes precedence over any stale local state
        const serverUnreadMap: Record<string, number> = {};
        chats.forEach((chat) => {
          if (chat.unreadCount > 0) {
            serverUnreadMap[chat.id] = chat.unreadCount;
          }
        });

        // Use server unread counts as the source of truth
        // Only preserve local unread counts if they are newer (messages received after server fetch)
        const currentUnreadCounts = get().unreadCounts;
        const mergedUnreadCounts: Record<string, number> = {
          ...serverUnreadMap,
        };

        // For any local unread counts that aren't in server map but chat exists, keep them
        // These are messages that came in via websocket while fetching chats
        Object.keys(currentUnreadCounts).forEach((chatId) => {
          if (
            !mergedUnreadCounts[chatId] &&
            chats.some((c) => c.id === chatId)
          ) {
            mergedUnreadCounts[chatId] = currentUnreadCounts[chatId];
          }
        });

        set({ chats, unreadCounts: mergedUnreadCounts });
      },

      addChat: (chat: Chat) => {
        set((state) => ({
          chats: [...state.chats, chat],
        }));
      },

      updateChatLastMessage: (chatId: string, message: LastMessage) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? { ...chat, lastMessage: message, updatedAt: message.createdAt }
              : chat,
          ),
        }));
      },

      incrementUnread: (chatId: string) => {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [chatId]: (state.unreadCounts[chatId] || 0) + 1,
          },
          // Also increment the chat's own unreadCount property to maintain consistency
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1 }
              : chat,
          ),
        }));
      },

      resetUnread: (chatId: string) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [chatId]: _, ...rest } = state.unreadCounts;
          // Also update the chat's own unreadCount property to ensure consistency
          const updatedChats = state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
          );
          return { unreadCounts: rest, chats: updatedChats };
        });
      },

      markAsRead: (chatId: string) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [chatId]: _, ...rest } = state.unreadCounts;
          // Also update the chat's own unreadCount property to ensure consistency
          const updatedChats = state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
          );
          return { unreadCounts: rest, chats: updatedChats };
        });
      },

      togglePin: (chatId: string) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, isPinned: !chat.isPinned } : chat,
          ),
        }));
      },

      toggleMute: (chatId: string) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, isMuted: !chat.isMuted } : chat,
          ),
        }));
      },

      updateChat: (chatId: string, updates: Partial<Chat>) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? { ...chat, ...updates } : chat,
          ),
        }));
      },

      removeChat: (chatId: string) => {
        set((state) => ({
          chats: state.chats.filter((chat) => chat.id !== chatId),
        }));
      },

      getTotalUnread: () => {
        const counts = get().unreadCounts;
        return Object.values(counts).reduce((sum, count) => sum + count, 0);
      },

      updateUserOnline: (userId: string, isOnline: boolean) => {
        set((state) => ({
          chats: state.chats.map((chat) => ({
            ...chat,
            members: chat.members.map((member) =>
              member.id === userId ? { ...member, isOnline } : member,
            ),
          })),
        }));
      },
    }),
    {
      name: "chats-storage",
      version: 2, // Increment version to trigger migration and clear stale data
      migrate: (persistedState: unknown, version: number) => {
        // If loading from version 1 or older, reset to initial state to clear stale unread counts
        if (version < 2) {
          return { ...initialState };
        }
        return persistedState as ChatsState & ChatsActions;
      },
    },
  ),
);
