"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useAuthStore } from "@/stores/auth";
import { Toasts } from "./Toasts";
import { RealtimeListener } from "./RealtimeListener";
import { CallProvider } from "./call/CallProvider";
import { CallOverlay } from "./call/CallOverlay";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // cacheTime renamed to gcTime in React Query v5
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

if (typeof window !== "undefined") {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === "success",
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const { hydrateFromStorage } = useAuthStore();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  return (
    <QueryClientProvider client={queryClient}>
      <CallProvider>
        {children}
        <CallOverlay />
        <Toasts />
        <RealtimeListener />
      </CallProvider>
    </QueryClientProvider>
  );
}
