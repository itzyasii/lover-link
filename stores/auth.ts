"use client";

import { create } from "zustand";
import { API_BASE_URL } from "@/lib/env";

type User = { id: string; email: string; username: string };

type AuthState = {
  accessToken: string | null;
  user: User | null;
  isHydrated: boolean;
  isRefreshing: boolean;
  setAccessToken: (t: string | null) => void;
  hydrateFromStorage: () => void;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
};

const LS_KEY = "loverlink_access_token";

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isHydrated: false,
  isRefreshing: false,
  setAccessToken: (t) => {
    set({ accessToken: t });
    if (typeof window !== "undefined") {
      if (t) localStorage.setItem(LS_KEY, t);
      else localStorage.removeItem(LS_KEY);
    }
  },
  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem(LS_KEY);
    // If we have a stored token, set it - the apiFetch interceptor will handle refreshing if needed
    if (t) {
      set({ accessToken: t, isHydrated: true });
      // Fetch user profile, the interceptor will refresh token if needed
      void fetchMe(t)
        .then((u) => set({ user: u }))
        .catch(() => {
          // If fetchMe fails, the interceptor will already have tried to refresh, so clear state
          get().setAccessToken(null);
          set({ user: null, isHydrated: true });
        });
    } else {
      // No token found - mark as hydrated
      set({ isHydrated: true });
    }
  },
  login: async (emailOrUsername, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ emailOrUsername, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const json = (await res.json()) as { accessToken: string; user: User };
    get().setAccessToken(json.accessToken);
    set({ user: json.user });
  },
  signup: async (email, username, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) throw new Error("Signup failed");
    const json = (await res.json()) as { accessToken: string; user: User };
    get().setAccessToken(json.accessToken);
    set({ user: json.user });
  },
  logout: async () => {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    get().setAccessToken(null);
    set({ user: null });
  },
  refresh: async () => {
    // If already refreshing, return true to let the existing refresh complete
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
      try {
        const u = await fetchMe(json.accessToken);
        set({ user: u });
      } catch {
        set({ user: null });
      }
      return true;
    } finally {
      set({ isRefreshing: false });
    }
  },
}));

async function fetchMe(token: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error("me failed");
  const json = (await res.json()) as { ok: true; user: User };
  return json.user;
}
