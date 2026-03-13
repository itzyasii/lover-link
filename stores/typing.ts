"use client";

import { create } from "zustand";

export type TypingState = {
  byChatId: Record<string, { from: string; at: number } | undefined>;
  setTyping: (chatId: string, from: string) => void;
  clearTyping: (chatId: string) => void;
};

export const useTypingStore = create<TypingState>((set) => ({
  byChatId: {},
  setTyping: (chatId, from) =>
    set((s) => ({
      byChatId: { ...s.byChatId, [chatId]: { from, at: Date.now() } },
    })),
  clearTyping: (chatId) =>
    set((s) => {
      const next = { ...s.byChatId };
      delete next[chatId];
      return { byChatId: next };
    }),
}));

