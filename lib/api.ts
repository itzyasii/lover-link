"use client";

import { API_BASE_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";
import { loadingBegin, loadingEnd } from "@/stores/loading";

async function refreshOnce() {
  return useAuthStore.getState().refresh();
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { auth?: boolean; retry?: boolean; trackLoading?: boolean } = {},
): Promise<T> {
  const auth = init.auth ?? true;
  const retry = init.retry ?? true;
  const trackLoading = init.trackLoading ?? true;

  if (trackLoading) loadingBegin();

  try {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) {
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
      if (ok) return apiFetch<T>(path, { ...init, retry: false, trackLoading: false });
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

export async function uploadFile(file: File) {
  loadingBegin();
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
    loadingEnd();
  }
}

