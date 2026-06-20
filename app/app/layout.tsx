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
        const ok = await refresh();
        if (!ok) {
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
      <div className="mx-auto grid h-dvh min-h-0 max-w-7xl grid-cols-1 overflow-hidden p-3 md:grid-cols-[240px_1fr] md:gap-3 md:p-4">
        <aside className="flex min-h-0 flex-col border-black/5 bg-white/70 p-3 shadow-sm md:h-full md:rounded-2xl md:border">
          <div className="hidden md:block">
            <Brand />
          </div>
          <nav className="grid grid-cols-3 gap-1 md:mt-6 md:grid-cols-1">
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
                    "focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold md:justify-start transition-colors",
                    active
                      ? "bg-[color:var(--rose-600)] text-white"
                      : "text-black/65 hover:bg-[color:var(--rose-600)]/10 hover:text-[color:var(--rose-600)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            className="focus-ring mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-black/5 px-4 py-3 text-sm font-semibold text-wine-900 hover:bg-black/10"
            onClick={() => void logout().then(() => router.push("/"))}
            type="button"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </aside>

        <main className="mt-3 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/70 shadow-sm md:mt-0">
          <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
            {children}
          </div>
        </main>
      </div>
      <CallOverlay />
      <NotificationPermission />
    </CallProvider>
  );
}
