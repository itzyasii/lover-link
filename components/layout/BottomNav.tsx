import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Users, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Chats", icon: MessageCircle },
  { href: "/app/friends", label: "Friends", icon: Users },
  { href: "/app/calls", label: "Calls", icon: Phone },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass-panel fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around pb-safe md:hidden border-t-0 rounded-t-3xl shadow-[0_-8px_30px_rgba(230,57,70,0.06)]">
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
              "focus-ring relative flex flex-1 flex-col items-center justify-center gap-1.5 py-3 transition-all active:scale-95",
              active ? "text-(--accent-primary)" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <div className={cn("relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300", active && "bg-(--accent-glow)")}>
              <Icon className={cn("transition-transform duration-300", active ? "h-5 w-5 scale-110" : "h-6 w-6")} />
            </div>
            <span className={cn("text-[10px] font-semibold tracking-wide transition-all duration-300", active ? "opacity-100" : "opacity-0 translate-y-2")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
