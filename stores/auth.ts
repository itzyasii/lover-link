"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
});

export type User = z.infer<typeof UserSchema>;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  fcmToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  login: (accessToken: string, refreshToken: string, user: User) => void;
  signup: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  refreshTokens: (newAccessToken: string, newRefreshToken: string) => void;
  setFcmToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  hydrateFromStorage: () => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  fcmToken: null,
  isAuthenticated: false,
  isLoading: true,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: (accessToken, refreshToken, user) => {
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      signup: (accessToken, refreshToken, user) => {
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: () => {
        set({
          ...initialState,
          isLoading: false,
        });
        localStorage.removeItem("auth-storage");
      },

      refreshTokens: (newAccessToken, newRefreshToken) => {
        set({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      },

      setFcmToken: (token) => {
        set({ fcmToken: token });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      hydrateFromStorage: () => {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.state?.accessToken && parsed.state?.user) {
              set({
                ...parsed.state,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            }
          } catch (e) {
            console.error("[Auth] Failed to hydrate from storage:", e);
          }
        }
        set({ isLoading: false });
      },

      clearAuth: () => {
        set({
          ...initialState,
          isLoading: false,
        });
      },
    }),
    {
      name: "auth-storage",
    },
  ),
);
