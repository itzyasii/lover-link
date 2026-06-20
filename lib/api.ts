"use client";

import { API_BASE_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";
import { loadingBegin, loadingEnd } from "@/stores/loading";

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let refreshFailedPermanently = false; // Prevent infinite refresh loops

async function refreshOnce() {
  // If refresh already failed permanently, don't try again
  if (refreshFailedPermanently) return false;

  // If already refreshing, return the existing promise to prevent multiple calls
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = useAuthStore.getState().refresh();

  try {
    const result = await refreshPromise;
    if (!result) {
      refreshFailedPermanently = true;
      // Log user out if refresh fails
      await useAuthStore.getState().logout();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return result;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & {
    auth?: boolean;
    retry?: boolean;
    trackLoading?: boolean;
  } = {},
): Promise<T> {
  // Debug: Log stack trace for presence endpoint calls
  if (path.includes("/api/users/presence")) {
    console.log("⚠️ PRESENCE API CALL DETECTED from stack:");
    console.trace(`Calling ${path}`);
  }
  const auth = init.auth ?? true;
  const retry = init.retry ?? true;
  const trackLoading = init.trackLoading ?? true;

  if (trackLoading) loadingBegin();

  try {
    const headers = new Headers(init.headers);
    if (
      !headers.has("content-type") &&
      init.body &&
      !(init.body instanceof FormData)
    ) {
      headers.set("content-type", "application/json");
    }

    if (auth) {
      const token = useAuthStore.getState().accessToken;
      if (token) headers.set("authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });

    if (res.status === 401 && retry) {
      const ok = await refreshOnce();
      if (ok)
        return apiFetch<T>(path, {
          ...init,
          retry: false,
          trackLoading: false,
        });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  } finally {
    if (trackLoading) loadingEnd();
  }
}

export async function uploadFile(file: File, trackLoading = true) {
  if (trackLoading) loadingBegin();
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append("file", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/uploads`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error("Upload failed");
    return (await res.json()) as { ok: true; item: unknown };
  } finally {
    if (trackLoading) loadingEnd();
  }
}
