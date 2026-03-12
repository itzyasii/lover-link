"use client";

import { create } from "zustand";
import { API_BASE_URL } from "@/lib/env";

type User = { id: string; email: string; username: string };

type AuthState = {
  accessToken: string | null;
  user: User | null;
  isHydrated: boolean;
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
    set({ accessToken: t, isHydrated: true });
    if (t) void fetchMe(t).then((u) => set({ user: u })).catch(() => set({ user: null }));
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
