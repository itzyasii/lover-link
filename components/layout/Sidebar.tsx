import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, Users, Phone, LogOut } from "lucide-react";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

const navItems = [
  { href: "/app", label: "Chats", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: Users },
  { href: "/app/calls", label: "Calls", icon: Phone },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="glass-panel hidden md:flex w-[280px] shrink-0 flex-col rounded-3xl p-5 shadow-lg">
      <div className="mb-8 pl-2">
        <Brand />
      </div>
      
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring group flex items-center gap-4 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all",
                active
                  ? "bg-(--accent-primary) text-white shadow-md shadow-(--accent-glow)"
                  : "text-gray-500 hover:bg-black/5 hover:text-gray-900"
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        className="focus-ring mt-auto flex items-center justify-center gap-2 rounded-2xl bg-black/5 px-4 py-3.5 text-sm font-semibold text-gray-600 transition-all hover:bg-black/10 hover:text-gray-900 active:scale-95"
        onClick={() => void logout().then(() => router.push("/"))}
        type="button"
      >
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </aside>
  );
}
