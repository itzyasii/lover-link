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
        set({ chats });
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
        }));
      },

      resetUnread: (chatId: string) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [chatId]: _, ...rest } = state.unreadCounts;
          return { unreadCounts: rest };
        });
      },

      markAsRead: (chatId: string) => {
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [chatId]: _, ...rest } = state.unreadCounts;
          return { unreadCounts: rest };
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
    },
  ),
);
