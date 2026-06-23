"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { getSocket } from "@/lib/socket";
import { onMessageListener, messaging } from "@/lib/firebase";
import { LogOut, MessageCircle, Phone, Users } from "lucide-react";
import { CallProvider } from "@/components/call/CallProvider";
import { CallOverlay } from "@/components/call/CallOverlay";
import { RealtimeListener } from "@/components/RealtimeListener";
import { NotificationPermission } from "@/components/NotificationPermission";

// Type definitions for app data
type Chat = {
  id: string;
  // Add other chat properties as needed
  [key: string]: unknown;
};

type Friend = {
  id: string;
  // Add other friend properties as needed
  [key: string]: unknown;
};

type Call = {
  id: string;
  // Add other call properties as needed
  [key: string]: unknown;
};

type FriendRequest = {
  id: string;
  // Add other request properties as needed
  [key: string]: unknown;
};

const nav = [
  { href: "/app", label: "Chats", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: Users },
  { href: "/app/calls", label: "Calls", icon: Phone },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isRefreshing = useAuthStore((s) => s.isRefreshing);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);
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
        try {
          const ok = await refresh();
          if (!ok) {
            router.push("/login");
          }
        } catch (error) {
          console.error("Refresh failed:", error);
          router.push("/login");
        }
      })();
      return;
    }

    // Only prefetch data if we have an access token and user exists
    if (accessToken && user) {
      // Prefetch all commonly used data to ensure it's available when pages render
      const prefetchAppData = async () => {
        try {
          // Prefetch chats (for main page)
          await queryClient.prefetchQuery({
            queryKey: ["chats"],
            queryFn: () => apiFetch<{ ok: true; chats: Chat[] }>("/api/chats"),
          });

          // Prefetch friends (for friends page)
          await queryClient.prefetchQuery({
            queryKey: ["friends"],
            queryFn: () =>
              apiFetch<{ ok: true; friends: Friend[] }>("/api/users/friends"),
          });

          // Prefetch friend requests
          await queryClient.prefetchQuery({
            queryKey: ["friendRequests"],
            queryFn: () =>
              apiFetch<{ ok: true; requests: FriendRequest[] }>(
                "/api/users/friends/requests",
              ),
          });

          // Prefetch calls (for calls page)
          await queryClient.prefetchQuery({
            queryKey: ["calls"],
            queryFn: () =>
              apiFetch<{ ok: true; calls: Call[] }>("/api/calls?limit=50"),
          });

          setIsAppDataReady(true);
        } catch (error) {
          console.error("Failed to prefetch app data:", error);
          setIsAppDataReady(true); // Still mark as ready even if some prefetches fail
        }
      };

      getSocket(); // Initialize socket connection
      prefetchAppData();
    } else if (accessToken && !user) {
      // Wait for user to be set from the prefetch in Providers
      const checkUserInterval = setInterval(() => {
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          clearInterval(checkUserInterval);
          // Now we can prefetch the app data
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

  // Show loading state while data is being prefetched
  if (!isHydrated || !isAppDataReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-gray-200 rounded mx-auto mb-4"></div>
            <div className="h-4 w-48 bg-gray-200 rounded mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CallProvider>
      <RealtimeListener />
      <div className="mx-auto flex h-dvh max-w-7xl flex-col overflow-hidden bg-gray-50 md:flex-row md:gap-4 md:p-4 pt-safe sm:pt-4 md:pt-0">
        {/* Mobile: Main content area first so it fills vertical space above nav */}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-sm md:mt-0 md:rounded-2xl md:border md:border-black/5 md:bg-white/70">
          <div className="min-h-0 flex-1 overflow-auto pt-4 md:pt-0">
            {children}
          </div>
        </main>

        <aside className="flex shrink-0 flex-row items-center justify-around border-t border-black/5 bg-white p-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:order-first md:h-full md:w-[260px] md:flex-col md:items-stretch md:justify-start md:rounded-2xl md:border md:bg-white/70 md:p-4 md:shadow-sm">
          <div className="hidden md:mb-8 md:block">
            <Brand />
          </div>
          <nav className="flex w-full justify-around md:w-auto md:flex-col md:gap-2">
            {nav.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "focus-ring flex flex-col items-center justify-center gap-1 rounded-2xl px-4 py-2 text-[10px] font-semibold transition-all md:flex-row md:justify-start md:gap-3 md:px-4 md:py-3 md:text-sm",
                    active
                      ? "text-(--rose-600) md:bg-(--rose-600) md:text-white"
                      : "text-gray-500 hover:bg-black/5 hover:text-gray-900",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 md:h-5 md:w-5",
                      active ? "scale-110 md:scale-100" : "",
                    )}
                  />
                  <span className={cn(active ? "font-bold" : "")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <button
            className="focus-ring mt-auto hidden w-full items-center justify-center gap-2 rounded-xl bg-black/5 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-black/10 hover:text-gray-900 md:flex"
            onClick={() => void logout().then(() => router.push("/"))}
            type="button"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </aside>
      </div>
      <CallOverlay />
      <NotificationPermission />
    </CallProvider>
  );
}

