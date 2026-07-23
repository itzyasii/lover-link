"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  Phone,
  Video,
  Clock,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  XCircle,
} from "lucide-react";
import { useCall } from "@/components/call/CallProvider";
import { useFriendsStore } from "@/stores/friends";
import { useToastStore } from "@/stores/toast";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCallsStore, CallHistoryItem } from "@/stores/calls";
import { useAuthStore } from "@/stores/auth";

export default function CallsPage() {
  const { initiateCall } = useCall();
  const { callHistory, setCallHistory } = useCallsStore();
  const { user: currentUser } = useAuthStore();
  const { blockedUsers } = useFriendsStore();
  const { addToast } = useToastStore();

  // Block check as required by CALLS-MESSAGES-NOTIFICATIONS-GUIDE
  const isBlockedEitherWay = (userId1: string, userId2: string): boolean => {
    return blockedUsers.some((b) => b.userId === userId2);
  };
  const observerTarget = useRef<HTMLDivElement>(null);

  const {
    data: callsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ calls: CallHistoryItem[]; nextCursor: string | null }>(
    {
      queryKey: ["call-history"],
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }) => {
        interface RawCallItem extends CallHistoryItem {
          caller: { id: string; username: string; email?: string };
          callee: { id: string; username: string; email?: string };
        }

        const url = pageParam ? `/api/calls?cursor=${pageParam}` : `/api/calls`;
        const response = await apiFetch<{
          ok: boolean;
          calls: RawCallItem[];
          nextCursor: string | null;
        }>(url);

        if (!response.ok) {
          throw new Error("Failed to fetch call history");
        }

        const mappedCalls: CallHistoryItem[] = response.calls.map(
          (call: RawCallItem) => {
            const isCurrentUserCaller = call.callerId === currentUser?.id;
            const participant = isCurrentUserCaller ? call.callee : call.caller;

            return {
              ...call,
              media: call.media || "video",
              duration:
                call.answeredAt && call.endedAt
                  ? Math.floor(
                      (new Date(call.endedAt).getTime() -
                        new Date(call.answeredAt).getTime()) /
                        1000,
                    )
                  : undefined,
              participant: participant
                ? {
                    id: participant.id,
                    username: participant.username,
                    email: participant.email,
                  }
                : call.participant || { id: "", username: "Unknown User" },
            };
          },
        );

        if (!pageParam) {
          setCallHistory(mappedCalls);
        }

        return { calls: mappedCalls, nextCursor: response.nextCursor };
      },
      getNextPageParam: (lastPage) => {
        if (!lastPage) return null;
        return lastPage.nextCursor ? lastPage.nextCursor : null;
      },
    },
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 1.0 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  const calls = callsData
    ? callsData.pages.flatMap((page) => page.calls)
    : callHistory;

  if (isLoading) {
    return <HeartbeatLoading message="Loading call history..." />;
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getDirectionIcon = (call: CallHistoryItem) => {
    if (!currentUser?.id)
      return <PhoneCall className="w-4 h-4 text-gray-500" />;
    const isOutgoing = call.callerId === currentUser.id;
    if (call.status === "missed") {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    if (isOutgoing) {
      return <PhoneOutgoing className="w-4 h-4 text-blue-500" />;
    }
    return <PhoneIncoming className="w-4 h-4 text-green-500" />;
  };

  const getCallDirection = (call: CallHistoryItem) => {
    if (!currentUser?.id) return "unknown";
    const isOutgoing = call.callerId === currentUser.id;
    if (call.status === "missed") return "missed";
    return isOutgoing ? "outgoing" : "incoming";
  };

  // Show heartbeat loading when fetching calls
  if (isLoading) {
    return <HeartbeatLoading fullScreen message="Loading calls..." />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Calls</h1>
        <p className="text-gray-500 mt-1">Your call history 📞</p>
      </div>

      {/* Quick Actions - Note: These would typically show a contact picker, for demo we'll call the first contact */}
      {/* <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => {
            if (
              calls.length > 0 &&
              currentUser?.id &&
              calls[0].participant?.id
            ) {
              if (isBlockedEitherWay(currentUser.id, calls[0].participant.id)) {
                addToast(
                  "Cannot call this user - you have blocked them",
                  "error",
                );
                return;
              }
              initiateCall(calls[0].participant, "audio");
            }
          }}
          className="flex items-center justify-center gap-2 p-4 bg-linear-to-r from-rose-500 to-pink-500 text-white rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
        >
          <Phone className="w-5 h-5" />
          <span className="font-semibold">Voice Call</span>
        </button>
        <button
          onClick={() => {
            if (
              calls.length > 0 &&
              currentUser?.id &&
              calls[0].participant?.id
            ) {
              if (isBlockedEitherWay(currentUser.id, calls[0].participant.id)) {
                addToast(
                  "Cannot call this user - you have blocked them",
                  "error",
                );
                return;
              }
              initiateCall(calls[0].participant, "video");
            }
          }}
          className="flex items-center justify-center gap-2 p-4 bg-linear-to-r from-rose-500 to-pink-500 text-white rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
        >
          <Video className="w-5 h-5" />
          <span className="font-semibold">Video Call</span>
        </button>
      </div> */}

      {/* Call History */}
      <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-rose-500" />
          Recent Calls
        </h3>

        {calls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <PhoneCall className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No calls yet</p>
            <p className="text-sm mt-1">Start a call with someone special!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => {
              const direction = getCallDirection(call);
              // Safely get participant info with fallback
              const participantName =
                call.participant?.username || "Unknown User";
              const participantId = call.participant?.id || "";

              return (
                <div
                  key={call.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-xl",
                    direction === "missed" ? "bg-red-50" : "bg-gray-50",
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white">
                      {call.media === "video" ? (
                        <Video className="w-5 h-5" />
                      ) : (
                        <Phone className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            "font-medium",
                            direction === "missed"
                              ? "text-red-600"
                              : "text-gray-900",
                          )}
                        >
                          {participantName}
                        </p>
                        {getDirectionIcon(call)}
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatTimeAgo(call.offeredAt)}
                        {call.duration && ` • ${formatDuration(call.duration)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (currentUser?.id && participantId) {
                          if (
                            isBlockedEitherWay(currentUser.id, participantId)
                          ) {
                            addToast(
                              "Cannot call this user - you have blocked them",
                              "error",
                            );
                            return;
                          }
                          initiateCall(call.participant, call.media);
                        }
                      }}
                      className="p-2 bg-rose-100 text-rose-500 rounded-full hover:bg-rose-200 transition-colors"
                      title={`Call back with ${call.media}`}
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Observer Target */}
        <div
          ref={observerTarget}
          className="h-10 w-full flex items-center justify-center py-4"
        >
          {isFetchingNextPage && (
            <div className="w-6 h-6 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
          )}
        </div>
      </div>
    </div>
  );
}
