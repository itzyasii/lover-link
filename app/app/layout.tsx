"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { getSocket } from "@/lib/socket";
import { Heart, MessageCircle, Phone, Users } from "lucide-react";
import { CallProvider } from "@/components/call/CallProvider";
import { CallOverlay } from "@/components/call/CallOverlay";

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
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!isHydrated) return;
    if (!accessToken) {
      void (async () => {
        const ok = await refresh();
        if (!ok) router.push("/login");
      })();
    }
  }, [accessToken, isHydrated, refresh, router]);

  useEffect(() => {
    if (accessToken) getSocket();
  }, [accessToken]);

  return (
    <CallProvider>
    <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-[280px_1fr]">
      <aside className="glass h-fit rounded-3xl p-5 md:sticky md:top-8">
        <Brand />
        <nav className="mt-6 grid gap-1">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "focus-ring flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold",
                  active
                    ? "bg-white/70 text-[color:var(--wine-900)]"
                    : "text-black/65 hover:bg-white/50",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-black/5 px-4 py-3 text-sm font-semibold text-[color:var(--wine-900)] hover:bg-black/10"
          onClick={() => void logout().then(() => router.push("/"))}
        >
          <Heart className="h-4 w-4" /> Log out
        </button>
      </aside>

      <main className="glass rounded-3xl p-5">{children}</main>
    </div>
    <CallOverlay />
    </CallProvider>
  );
}
