"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { getSocket } from "@/lib/socket";
import { LogOut, MessageCircle, Phone, Users } from "lucide-react";
import { CallProvider } from "@/components/call/CallProvider";
import { CallOverlay } from "@/components/call/CallOverlay";
import { RealtimeListener } from "@/components/RealtimeListener";
import { NotificationPermission } from "@/components/NotificationPermission";

const nav = [
  { href: "/app", label: "Chats", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: Users },
  { href: "/app/calls", label: "Calls", icon: Phone },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isRefreshing = useAuthStore((s) => s.isRefreshing);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);

  const hasAttemptedRefresh = useRef(false);
  useEffect(() => {
    // Wait for store to fully hydrate before checking auth
    if (!isHydrated) return;

    // If we already have an access token, no need to refresh
    if (accessToken) return;

    // Only attempt refresh once to prevent infinite loops
    if (hasAttemptedRefresh.current || isRefreshing) return;

    hasAttemptedRefresh.current = true;
    void (async () => {
      const ok = await refresh();
      if (!ok) {
        router.push("/login");
      }
    })();
  }, [isHydrated, accessToken, isRefreshing, refresh, router]);

  useEffect(() => {
    if (accessToken) getSocket();
  }, [accessToken]);

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
                // Special case for home (Chats) page - only match exact /app
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
                    "focus-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold md:justify-start",
                    active
                      ? "bg-wine-900 text-white"
                      : "text-black/65 hover:bg-black/5",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            className="focus-ring mt-auto hidden w-full items-center justify-center gap-2 rounded-xl bg-black/5 px-4 py-3 text-sm font-semibold text-wine-900 hover:bg-black/10 md:flex"
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
