"use client";

import { create } from "zustand";
import { API_BASE_URL } from "@/lib/env";
import { apiFetch } from "@/lib/api";

export type User = { id: string; email: string; username: string };

type AuthState = {
  accessToken: string | null;
  user: User | null;
  fcmToken: string | null;
  isHydrated: boolean;
  isRefreshing: boolean;
  setAccessToken: (t: string | null) => void;
  setUser: (user: User | null) => void;
  setFcmToken: (token: string | null) => void;
  hydrateFromStorage: () => void;
  login: (
    emailOrUsername: string,
    password: string,
    fcmToken: string | null,
  ) => Promise<void>;
  signup: (
    email: string,
    username: string,
    password: string,
    fcmToken: string | null,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
};

const LS_KEY = "loverlink_access_token";

export const fetchMe = async (): Promise<User> => {
  const res = await apiFetch<{ ok: true; user: User }>("/api/auth/me");
  return res.user;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  fcmToken: null,
  isHydrated: false,
  isRefreshing: false,
  setAccessToken: (t) => {
    set({ accessToken: t });
    if (typeof window !== "undefined") {
      if (t) localStorage.setItem(LS_KEY, t);
      else localStorage.removeItem(LS_KEY);
    }
  },
  setUser: (user) => set({ user }),
  setFcmToken: (token) => set({ fcmToken: token }),
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem(LS_KEY);
    if (t) {
      set({ accessToken: t, isHydrated: true });
    } else {
      set({ isHydrated: true });
    }
  },
  login: async (emailOrUsername, password, fcmToken) => {
    const body: Record<string, unknown> = { emailOrUsername, password };
    if (fcmToken) {
      body.fcmToken = fcmToken;
    }
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Login failed");
    const json = (await res.json()) as { accessToken: string; user: User };
    get().setAccessToken(json.accessToken);
    get().setFcmToken(fcmToken);
    set({ user: json.user });
  },
  signup: async (email, username, password, fcmToken) => {
    const body: Record<string, unknown> = { email, username, password };
    if (fcmToken) {
      body.fcmToken = fcmToken;
    }
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Signup failed");
    const json = (await res.json()) as { accessToken: string; user: User };
    get().setAccessToken(json.accessToken);
    get().setFcmToken(fcmToken);
    set({ user: json.user });
  },
  logout: async () => {
    // Unregister FCM token in single API call to logout endpoint
    const currentFcmToken = get().fcmToken;

    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: currentFcmToken
          ? JSON.stringify({ fcmToken: currentFcmToken })
          : undefined,
      });
    } catch (error) {
      console.warn(
        "[Auth] Logout API call failed, but proceeding with local logout:",
        error,
      );
    }

    get().setAccessToken(null);
    get().setFcmToken(null);
    set({ user: null });
    console.log("[Auth] User logged out successfully");
  },
  refresh: async () => {
    if (get().isRefreshing) return true;

    set({ isRefreshing: true });

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { accessToken: string };
      get().setAccessToken(json.accessToken);
      return true;
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
