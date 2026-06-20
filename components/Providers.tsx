"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore, fetchMe } from "@/stores/auth";
import { Toasts } from "@/components/Toasts";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { API_BASE_URL } from "@/lib/env";
import { registerServiceWorker, onMessageListener } from "@/lib/firebase";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const hydrate = useAuthStore((s) => s.hydrateFromStorage);
  const setUser = useAuthStore((s) => s.setUser);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const storeSetUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    hydrate();

    // Initialize Firebase service worker
    registerServiceWorker();

    // Setup foreground message listener
    const unsubscribe = onMessageListener((payload) => {
      console.log("[Providers] Received foreground message:", payload);
      // You can add global notification handling here, like showing a toast
    });

    return () => {
      unsubscribe();
    };
  }, [hydrate]);

  // Prefetch user data when access token is available
  useEffect(() => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken && client) {
      // Fetch and cache the current user
      client
        .fetchQuery({
          queryKey: ["currentUser"],
          queryFn: fetchMe,
        })
        .then((user) => {
          if (user) {
            storeSetUser(user);
          }
        })
        .catch(() => {
          // If fetchMe fails, clear auth state
          setAccessToken(null);
          storeSetUser(null);
        });
    }
  }, [client, setAccessToken, storeSetUser]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toasts />
      <HeartbeatLoading />
    </QueryClientProvider>
  );
}
