"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Users, Phone, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import { useChatsStore } from "@/stores/chats";
import { useToastStore } from "@/stores/toast";
import { apiFetch } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { getSocket } from "@/lib/socket";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { Brand } from "@/components/Brand";
import { NotificationPermission } from "@/components/NotificationPermission";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/app", label: "Chats", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: Users },
  { href: "/app/calls", label: "Calls", icon: Phone },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user, logout } = useAuthStore();
  const { getTotalUnread } = useChatsStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (isAuthenticated && user?.id) {
      try {
        getSocket();
      } catch (error) {
        console.error("[Socket] Failed to initialize:", error);
      }
    }

    return () => {
      // Don't disconnect on unmount if still authenticated
    };
  }, [isAuthenticated, isLoading, router, user?.id]);

  const handleLogout = async () => {
    try {
      const { fcmToken } = useAuthStore.getState();
      await apiFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ fcmToken }),
      });
      logout();
      disconnectSocket();
      addToast("You've been logged out. Until next time! 💕", "info");
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isLoading) {
    return <HeartbeatLoading fullScreen />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-rose-50 via-pink-50 to-red-50">
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Sidebar Navigation */}
        <aside className="lg:w-20 xl:w-64 lg:min-h-screen bg-white/80 backdrop-blur-lg border-b lg:border-b-0 lg:border-r border-rose-100 p-4">
          <div className="flex lg:flex-col items-center justify-between h-full">
            <div className="flex lg:flex-col items-center gap-6">
              <div className="hidden lg:block mb-4">
                <Brand size="md" />
              </div>
              <div className="flex lg:flex-col gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                        isActive
                          ? "bg-linear-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-200"
                          : "text-gray-600 hover:bg-rose-50 hover:text-rose-500",
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="hidden xl:inline font-medium">
                        {item.label}
                      </span>
                      {item.href === "/app" && getTotalUnread() > 0 && (
                        <span className="xl:ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {getTotalUnread()}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex lg:flex-col items-center gap-2">
              {/* User Profile */}
              <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-rose-50 rounded-xl mb-2">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white font-bold">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {user?.username}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden xl:inline font-medium">Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full p-2 lg:p-4"
          >
            {children}
          </motion.div>
        </main>
      </div>

      <NotificationPermission />
    </div>
  );
}
