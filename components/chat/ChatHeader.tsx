import { ChevronLeft, Phone, Video } from "lucide-react";
import Link from "next/link";
import { useCall } from "@/components/call/CallProvider";

interface ChatHeaderProps {
  displayName: string;
  status: string;
  otherUserId: string | null;
}

export function ChatHeader({ displayName, status, otherUserId }: ChatHeaderProps) {
  const { startCall } = useCall();

  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-b border-black/5 bg-white/80 backdrop-blur-xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Link href="/app" className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 active:scale-95 md:hidden">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="grow">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">{displayName}</h1>
          <p className="text-[13px] font-medium text-gray-500">{status}</p>
        </div>
      </div>
      
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-(--accent-primary) transition-all hover:bg-(--accent-glow)/10 active:scale-95"
          onClick={() => otherUserId && startCall(otherUserId, "audio")}
        >
          <Phone className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-(--accent-primary) transition-all hover:bg-(--accent-glow)/10 active:scale-95"
          onClick={() => otherUserId && startCall(otherUserId, "video")}
        >
          <Video className="h-5 w-5 border-2 border-transparent" />
        </button>
      </div>
    </header>
  );
}
