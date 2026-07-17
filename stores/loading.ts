"use client";

import { create } from "zustand";

interface LoadingState {
  isGlobalLoading: boolean;
  loadingStates: Record<string, boolean>;
}

interface LoadingActions {
  setGlobalLoading: (loading: boolean) => void;
  startLoading: (key: string) => void;
  stopLoading: (key: string) => void;
  isLoading: (key: string) => boolean;
}

export const useLoadingStore = create<LoadingState & LoadingActions>(
  (set, get) => ({
    isGlobalLoading: false,
    loadingStates: {},

    setGlobalLoading: (loading) => {
      set({ isGlobalLoading: loading });
    },

    startLoading: (key) => {
      set((state) => ({
        loadingStates: { ...state.loadingStates, [key]: true },
      }));
    },

    stopLoading: (key) => {
      set((state) => ({
        loadingStates: { ...state.loadingStates, [key]: false },
      }));
    },

    isLoading: (key) => {
      return get().loadingStates[key] || false;
    },
  }),
);
