import { useAuthStore } from "@/stores/auth";
import { env } from "./env";

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

function getApiUrl(endpoint: string) {
  // Browser requests stay same-origin and are forwarded by the Next.js rewrite.
  // This avoids browser-specific cross-origin connection failures in development.
  return typeof window === "undefined"
    ? `${env.API_BASE_URL}${endpoint}`
    : endpoint;
}

async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    return refreshPromise!;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { refreshToken } = useAuthStore.getState();
      if (!refreshToken) {
        return null;
      }

      const response = await fetch(getApiUrl("/api/auth/refresh"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to refresh token");
      }

      const data = await response.json();
      if (data.ok && data.accessToken) {
        const newRefreshToken = data.refreshToken || refreshToken;
        useAuthStore
          .getState()
          .refreshTokens(data.accessToken, newRefreshToken);
        return data.accessToken;
      }

      throw new Error("Invalid refresh response");
    } catch (error) {
      console.error("[API] Token refresh failed:", error);
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(getApiUrl(endpoint), {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(getApiUrl(endpoint), {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }

  return response.json();
}

export async function apiFormData<T>(
  endpoint: string,
  formData: FormData,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response = await fetch(getApiUrl(endpoint), {
    ...options,
    method: options.method || "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(getApiUrl(endpoint), {
        ...options,
        headers,
        body: formData,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }

  return response.json();
}
