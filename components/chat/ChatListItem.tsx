import Link from "next/link";
import { formatLastSeen } from "@/lib/time";
import { Chat } from "@/stores/chats";
import { Pin, PinOff, Bell, BellOff, MoreVertical } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useDrag } from "@use-gesture/react";
import { useSpring, animated } from "@react-spring/web";

interface ChatListItemProps {
  chat: Chat;
  name: string;
  presence: { isOnline: boolean; lastSeenAt: string | null } | null | undefined;
  otherMemberId: string | null;
  meId: string | undefined;
  unreadCount: number;
  isTyping: boolean;
  previewText: string;
  timeText: string;
  onPin: (isPinned: boolean) => void;
  onMute: (isMuted: boolean) => void;
  onDelete?: () => void;
}

export function ChatListItem({
  chat,
  name,
  presence,
  unreadCount,
  isTyping,
  previewText,
  timeText,
  onPin,
  onMute,
}: ChatListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Swipe gesture for mobile
  const [{ x }, api] = useSpring(() => ({ x: 0 }));
  
  const bind = useDrag(({ down, movement: [mx], cancel }) => {
    if (mx > 100 && !down) {
      // Pin action trigger threshold
      onPin(chat.isPinned ?? false);
      cancel();
    } else if (mx < -100 && !down) {
      // Mute action trigger threshold
      onMute(chat.isMuted ?? false);
      cancel();
    }
    
    // Only animate if movement is somewhat intentional
    api.start({ x: down ? mx : 0, immediate: down, config: { tension: 300, friction: 30 } });
  }, { axis: 'x', filterTaps: true, bounds: { left: -120, right: 120 } });

  return (
    <div className="relative touch-pan-y overflow-hidden rounded-[24px]">
      {/* Background actions revealed by swipe */}
      <div className="absolute inset-0 flex items-center justify-between px-6 text-white text-sm font-semibold">
        <div className="flex items-center gap-2 text-(--accent-primary)">
          {chat.isPinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
          {chat.isPinned ? "Unpin" : "Pin"}
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          {chat.isMuted ? "Unmute" : "Mute"}
          {chat.isMuted ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
      </div>

      <animated.div 
        {...bind()}
        style={{ x }}
        className="relative z-10"
      >
        <Link
          href={`/app/chat/${chat.id}`}
          className="group focus-ring flex items-center justify-between rounded-[24px] bg-white/80 backdrop-blur-md px-5 py-4 shadow-sm border border-white/50 hover:bg-white hover:shadow-md hover:scale-[1.01] transition-all duration-300"
        >
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <ChatAvatar name={name} />
              <span
                className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                  presence?.isOnline ? "bg-green-500" : "bg-gray-300"
                } transition-colors duration-300 shadow-sm`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex items-center gap-2 truncate text-[15px] font-semibold text-gray-900">
                  {chat.isPinned && <Pin className="h-3.5 w-3.5 shrink-0 text-(--accent-primary)" />}
                  <span className="truncate">{name}</span>
                  {chat.isMuted && <BellOff className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                </div>
                <span className="shrink-0 text-xs font-medium text-gray-400">
                  {timeText}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-4 text-[13px] text-gray-500">
                {isTyping ? (
                  <div className="inline-flex min-w-0 items-center gap-2 truncate font-medium text-(--accent-primary)">
                    Typing
                    <span className="typing-dots" aria-hidden="true">
                      <span /><span /><span />
                    </span>
                  </div>
                ) : (
                  <div className="min-w-0 truncate font-medium text-gray-500/90">{previewText}</div>
                )}
              </div>
            </div>
            
            <div className="flex shrink-0 items-center gap-2 ml-3">
              {unreadCount > 0 && (
                <div className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--accent-primary) px-1.5 text-[11px] font-bold text-white shadow-md shadow-(--accent-glow)">
                  {unreadCount}
                </div>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(!menuOpen);
                  }}
                  className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 active:bg-black/10"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-2xl border border-black/5 bg-white/95 backdrop-blur-xl py-1 shadow-xl animate-slide-up origin-top-right">
                    <button
                      type="button"
                      onClick={(e) => { setMenuOpen(false); onPin(chat.isPinned ?? false); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-(--accent-glow)/10 hover:text-(--accent-primary)"
                    >
                      {chat.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      {chat.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { setMenuOpen(false); onMute(chat.isMuted ?? false); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-black/5"
                    >
                      {chat.isMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      {chat.isMuted ? "Unmute" : "Mute"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Link>
      </animated.div>
    </div>
  );
}

function ChatAvatar({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-pink-100 to-rose-100 text-sm font-bold uppercase tracking-wider text-(--accent-primary) shadow-sm border-2 border-white">
      {initials}
    </div>
  );
}
