"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { getSocket } from "@/lib/socket";
import { onMessageListener, messaging } from "@/lib/firebase";
import { CallProvider } from "@/components/call/CallProvider";
import { CallOverlay } from "@/components/call/CallOverlay";
import { RealtimeListener } from "@/components/RealtimeListener";
import { NotificationPermission } from "@/components/NotificationPermission";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

// Type definitions for app data
type Chat = {
  id: string;
  [key: string]: unknown;
};

type Friend = {
  id: string;
  [key: string]: unknown;
};

type Call = {
  id: string;
  [key: string]: unknown;
};

type FriendRequest = {
  id: string;
  [key: string]: unknown;
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isRefreshing = useAuthStore((s) => s.isRefreshing);
  const refresh = useAuthStore((s) => s.refresh);
  const [isAppDataReady, setIsAppDataReady] = useState(false);

  const hasAttemptedRefresh = useRef(false);

  // Register Firebase service worker for background notifications
  useEffect(() => {
    if ("serviceWorker" in navigator && messaging) {
      window.addEventListener("load", async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/firebase-messaging-sw.js",
          );
          console.log(
            "ServiceWorker registration successful:",
            registration.scope,
          );
        } catch (err) {
          console.log("ServiceWorker registration failed:", err);
        }
      });
    }
  }, []);

  // Handle foreground FCM messages
  useEffect(() => {
    if (messaging && accessToken) {
      onMessageListener((payload) => {
        console.log("Foreground notification received:", payload);

        // Handle navigation based on notification type
        if (payload.data?.type === "new_message" && payload.data.chatId) {
          // Invalidate chats query to refresh messages
          queryClient.invalidateQueries({ queryKey: ["chats"] });
        } else if (
          payload.data?.type === "incoming_call" ||
          payload.data?.type === "missed_call"
        ) {
          // Invalidate calls query
          queryClient.invalidateQueries({ queryKey: ["calls"] });
        }
      });
    }
  }, [accessToken, queryClient]);

  // Prefetch all critical app data once auth is ready
  useEffect(() => {
    if (!isHydrated) return;

    if (!accessToken) {
      if (hasAttemptedRefresh.current || isRefreshing) return;

      hasAttemptedRefresh.current = true;
      void (async () => {
        const ok = await refresh();
        if (!ok) {
          router.push("/login");
        }
      })();
      return;
    }

    if (accessToken && user) {
      const prefetchAppData = async () => {
        try {
          await queryClient.prefetchQuery({
            queryKey: ["chats"],
            queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
          });

          await queryClient.prefetchQuery({
            queryKey: ["friends"],
            queryFn: () =>
              apiFetch<{ ok: true; friends: Friend[] }>("/api/users/friends"),
          });

          await queryClient.prefetchQuery({
            queryKey: ["friendRequests"],
            queryFn: () =>
              apiFetch<{ ok: true; requests: FriendRequest[] }>(
                "/api/users/friends/requests",
              ),
          });

          await queryClient.prefetchQuery({
            queryKey: ["calls"],
            queryFn: () =>
              apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
          });

          setIsAppDataReady(true);
        } catch (error) {
          console.error("Failed to prefetch app data:", error);
          setIsAppDataReady(true);
        }
      };

      getSocket(); // Initialize socket connection
      prefetchAppData();
    } else if (accessToken && !user) {
      const checkUserInterval = setInterval(() => {
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          clearInterval(checkUserInterval);
          const prefetchAppData = async () => {
            try {
              await queryClient.prefetchQuery({
                queryKey: ["chats"],
                queryFn: () =>
                  apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
              });
              await queryClient.prefetchQuery({
                queryKey: ["friends"],
                queryFn: () =>
                  apiFetch<{ ok: true; friends: Friend[] }>(
                    "/api/users/friends",
                  ),
              });
              await queryClient.prefetchQuery({
                queryKey: ["friendRequests"],
                queryFn: () =>
                  apiFetch<{ ok: true; requests: FriendRequest[] }>(
                    "/api/users/friends/requests",
                  ),
              });
              await queryClient.prefetchQuery({
                queryKey: ["calls"],
                queryFn: () =>
                  apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
              });
              getSocket();
              setIsAppDataReady(true);
            } catch {
              setIsAppDataReady(true);
            }
          };
          prefetchAppData();
        }
      }, 100);

      return () => clearInterval(checkUserInterval);
    }
  }, [
    isHydrated,
    accessToken,
    user,
    isRefreshing,
    refresh,
    router,
    queryClient,
  ]);

  if (!isHydrated || !isAppDataReady) {
    return (
      <div className="flex h-dvh items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-(--accent-primary) animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-4 w-4 rounded-full bg-(--accent-primary) animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-4 w-4 rounded-full bg-(--accent-primary) animate-bounce"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CallProvider>
      <RealtimeListener />
      <div className="mx-auto flex h-dvh max-w-7xl flex-col overflow-hidden md:flex-row md:gap-6 md:p-6 pb-0">
        
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-[2.5rem] md:shadow-2xl md:shadow-(--accent-glow)/20 md:border md:border-white/20 relative z-10 pb-[68px] md:pb-0">
          <div className="min-h-0 flex-1 overflow-auto animate-slide-up">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <BottomNav />
      </div>
      <CallOverlay />
      <NotificationPermission />
    </CallProvider>
  );
}

