"use client";

import { create } from "zustand";

type LoadingState = {
  count: number;
  begin: () => void;
  end: () => void;
};

export const useLoadingStore = create<LoadingState>((set) => ({
  count: 0,
  begin: () => set((s) => ({ count: s.count + 1 })),
  end: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

export function loadingBegin() {
  useLoadingStore.getState().begin();
}

export function loadingEnd() {
  useLoadingStore.getState().end();
}

