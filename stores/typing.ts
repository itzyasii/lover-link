"use client";

import { create } from "zustand";

interface TypingState {
  typingUsers: Record<string, string[]>; // chatId -> array of userIds typing
}

interface TypingActions {
  startTyping: (chatId: string, userId: string) => void;
  stopTyping: (chatId: string, userId: string) => void;
  isSomeoneTyping: (chatId: string) => boolean;
  getTypingUsers: (chatId: string) => string[];
  clearChat: (chatId: string) => void;
}

export const useTypingStore = create<TypingState & TypingActions>(
  (set, get) => ({
    typingUsers: {},

    startTyping: (chatId, userId) => {
      set((state) => {
        const currentTypers = state.typingUsers[chatId] || [];
        if (currentTypers.includes(userId)) return state;
        return {
          typingUsers: {
            ...state.typingUsers,
            [chatId]: [...currentTypers, userId],
          },
        };
      });
    },

    stopTyping: (chatId, userId) => {
      set((state) => {
        const currentTypers = state.typingUsers[chatId] || [];
        return {
          typingUsers: {
            ...state.typingUsers,
            [chatId]: currentTypers.filter((id) => id !== userId),
          },
        };
      });
    },

    isSomeoneTyping: (chatId) => {
      const typers = get().typingUsers[chatId] || [];
      return typers.length > 0;
    },

    getTypingUsers: (chatId) => {
      return get().typingUsers[chatId] || [];
    },

    clearChat: (chatId) => {
      set((state) => {
        const { [chatId]: _, ...rest } = state.typingUsers;
        return { typingUsers: rest };
      });
    },
  }),
);
