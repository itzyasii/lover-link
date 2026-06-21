import { create } from "zustand";

export type ChatMember = string | { id: string; email?: string; username?: string };

export type Chat = {
  id: string;
  type: "dm";
  members: ChatMember[];
  lastMessage?: {
    id: string;
    type: "text" | "share" | "event";
    text: string | null;
    itemKind: "file" | "image" | "video" | "audio" | null;
    eventKind: "call_started" | "call_ended" | null;
    eventMedia: "audio" | "video" | null;
    from: string;
    createdAt: string;
  } | null;
  isPinned?: boolean;
  isMuted?: boolean;
  updatedAt: string;
  createdAt?: string;
};

type ChatsState = {
  chats: Chat[];
  unreadCounts: Record<string, number>;
  setChats: (chats: Chat[]) => void;
  updateChatLastMessage: (chatId: string, message: any) => void;
  incrementUnread: (chatId: string) => void;
  resetUnread: (chatId: string) => void;
  togglePin: (chatId: string) => void;
  toggleMute: (chatId: string) => void;
};

export const useChatsStore = create<ChatsState>((set) => ({
  chats: [],
  unreadCounts: {},
  setChats: (chats) => set({ chats }),
  updateChatLastMessage: (chatId, message) =>
    set((state) => {
      const chatIndex = state.chats.findIndex((c) => c.id === chatId);
      if (chatIndex === -1) return state; // Chat not loaded yet

      const newChats = [...state.chats];
      const chat = { ...newChats[chatIndex] };
      chat.lastMessage = {
        id: message.id,
        type: message.type,
        text: message.text ?? null,
        itemKind: message.item?.kind ?? null,
        eventKind: message.event?.kind ?? null,
        eventMedia: message.event?.media ?? null,
        from: message.from,
        createdAt: message.createdAt,
      };
      chat.updatedAt = new Date().toISOString();
      newChats[chatIndex] = chat;
      return { chats: newChats };
    }),
  incrementUnread: (chatId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [chatId]: (state.unreadCounts[chatId] || 0) + 1,
      },
    })),
  resetUnread: (chatId) =>
    set((state) => {
      const newCounts = { ...state.unreadCounts };
      delete newCounts[chatId];
      return { unreadCounts: newCounts };
    }),
  togglePin: (chatId) =>
    set((state) => {
      const newChats = state.chats.map((c) =>
        c.id === chatId ? { ...c, isPinned: !c.isPinned } : c
      );
      return { chats: newChats };
    }),
  toggleMute: (chatId) =>
    set((state) => {
      const newChats = state.chats.map((c) =>
        c.id === chatId ? { ...c, isMuted: !c.isMuted } : c
      );
      return { chats: newChats };
    }),
}));
