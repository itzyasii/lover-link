"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, Heart, MessageSquare } from "lucide-react";
import { useChatsStore, Chat } from "@/stores/chats";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ChatsPage() {
  const { user } = useAuthStore();
  const { setChats, chats } = useChatsStore();
  const { isSomeoneTyping } = useTypingStore();

  const { isLoading, error } = useQuery<{ chats: Chat[] }>({
    queryKey: ["chats"],
    queryFn: async () => {
      const response = await apiFetch<{ ok: boolean; chats: Chat[] }>(
        "/api/chats",
      );
      if (response.ok) {
        setChats(response.chats);
        return { chats: response.chats };
      }
      throw new Error("Failed to fetch chats");
    },
  });

  if (isLoading && chats.length === 0) {
    return <HeartbeatLoading message="Loading your conversations..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <Heart className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Couldn&apos;t load chats
        </h2>
        <p className="text-gray-500 mt-2">
          Please refresh the page to try again
        </p>
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center mb-6">
          <MessageSquare className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">
          No conversations yet
        </h2>
        <p className="text-gray-500 mt-2 max-w-sm">
          Connect with someone special and start your love story. Add friends to
          begin chatting!
        </p>
        <Link
          href="/app/friends"
          className="mt-6 px-6 py-3 bg-linear-to-r from-rose-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
        >
          Find Friends
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Your Chats</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.username}! ❤️</p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search conversations..."
          className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-rose-100 focus:outline-none focus:border-rose-400 transition-colors shadow-sm"
        />
      </div>

      {/* Chat List */}
      <div className="space-y-3">
        {chats.map((chat) => {
          const otherMember = chat.members.find((m) => m.id !== user?.id);
          const isTyping = isSomeoneTyping(chat.id);

          return (
            <Link
              key={chat.id}
              href={`/app/chat/${chat.id}`}
              className="block bg-white rounded-2xl border border-rose-100 p-4 hover:shadow-lg hover:shadow-rose-100/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg">
                    {otherMember?.username?.[0]?.toUpperCase() || "?"}
                  </div>
                  {otherMember?.isOnline && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>

                {/* Chat Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 group-hover:text-rose-500 transition-colors">
                      {otherMember?.username || "Unknown"}
                    </h3>
                    {chat.lastMessage && (
                      <span className="text-xs text-gray-400">
                        {formatTime(chat.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p
                      className={cn(
                        "text-sm truncate",
                        isTyping
                          ? "text-rose-500 font-medium"
                          : "text-gray-500",
                      )}
                    >
                      {isTyping ? (
                        <>
                          typing<span className="inline-flex">...</span>
                        </>
                      ) : (
                        chat.lastMessage?.text || "Start a conversation"
                      )}
                    </p>
                    {chat.unreadCount && chat.unreadCount > 0 && (
                      <span className="ml-2 bg-linear-to-r from-rose-500 to-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
