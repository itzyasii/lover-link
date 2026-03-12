"use client";

import { create } from "zustand";

export type ToastItem = {
  id: string;
  title: string;
  message?: string;
  tone?: "default" | "success" | "error";
  createdAt: number;
};

type ToastState = {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id" | "createdAt"> & { id?: string }) => string;
  remove: (id: string) => void;
  clear: () => void;
};

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (t) => {
    const id = t.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const item: ToastItem = { id, createdAt: Date.now(), tone: "default", ...t };
    set((s) => ({ items: [item, ...s.items].slice(0, 5) }));
    setTimeout(() => get().remove(id), 4500);
    return id;
  },
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
}));

export function toast(t: Omit<ToastItem, "id" | "createdAt">) {
  return useToastStore.getState().push(t);
}

