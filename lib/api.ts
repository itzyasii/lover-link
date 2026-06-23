"use client";

import { API_BASE_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";
import { loadingBegin, loadingEnd } from "@/stores/loading";

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let lastRefreshFailedAt = 0;
let refreshFailCount = 0;
const REFRESH_COOLDOWN = 30000; // 30 seconds cooldown after failed refresh
const MAX_REFRESH_FAILURES = 3; // Only lock permanently after 3 consecutive failures

// Track concurrent loading requests to prevent multiple loading indicator flashes
let activeLoadingRequests = 0;

async function refreshOnce() {
  // If we've failed multiple times permanently, don't try again
  if (refreshFailCount >= MAX_REFRESH_FAILURES) return false;

  // If we're still in cooldown after a failed refresh, don't try again yet
  const now = Date.now();
  if (lastRefreshFailedAt > 0 && now - lastRefreshFailedAt < REFRESH_COOLDOWN) {
    console.log(
      `[Refresh] In cooldown, skipping refresh attempt (${Math.round((REFRESH_COOLDOWN - (now - lastRefreshFailedAt)) / 1000)}s remaining)`,
    );
    return false;
  }

  // If already refreshing, return the existing promise to prevent multiple calls
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = useAuthStore.getState().refresh();

  try {
    const result = await refreshPromise;
    if (!result) {
      refreshFailCount++;
      lastRefreshFailedAt = now;
      console.warn(
        `[Refresh] Refresh failed (${refreshFailCount}/${MAX_REFRESH_FAILURES})`,
      );

      // Only set permanent failure after MAX_REFRESH_FAILURES attempts
      if (refreshFailCount >= MAX_REFRESH_FAILURES) {
        console.error("[Refresh] Max refresh failures reached, logging out");
        await useAuthStore.getState().logout();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
      return false;
    }
    // Reset failure counter on successful refresh
    refreshFailCount = 0;
    lastRefreshFailedAt = 0;
    return result;
  } catch (error) {
    console.error("Refresh failed with error:", error);
    refreshFailCount++;
    lastRefreshFailedAt = now;

    if (refreshFailCount >= MAX_REFRESH_FAILURES) {
      console.error("[Refresh] Max refresh failures reached, logging out");
      await useAuthStore.getState().logout();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return false;
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

  if (trackLoading) {
    // Only call loadingBegin once if this is the first active request
    if (activeLoadingRequests === 0) {
      loadingBegin();
    }
    activeLoadingRequests++;
  }

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
    if (trackLoading) {
      activeLoadingRequests--;
      // Only call loadingEnd once all active requests are complete
      if (activeLoadingRequests === 0) {
        loadingEnd();
      }
    }
  }
}

export async function uploadFile(file: File, trackLoading = true) {
  if (trackLoading) {
    if (activeLoadingRequests === 0) {
      loadingBegin();
    }
    activeLoadingRequests++;
  }
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
    if (trackLoading) {
      activeLoadingRequests--;
      if (activeLoadingRequests === 0) {
        loadingEnd();
      }
    }
  }
}
