"use client";

import { useQuery } from "@tanstack/react-query";
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
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCallsStore, CallHistoryItem } from "@/stores/calls";

// Create mock calls with static timestamps - these are just for demo purposes
const MOCK_BASE_TIME = Date.now();
const mockCalls: CallHistoryItem[] = [
  {
    id: "1",
    callId: "call-1",
    callerId: "current-user",
    calleeId: "user1",
    media: "video" as const,
    status: "ended" as const,
    offeredAt: new Date(MOCK_BASE_TIME - 3600000).toISOString(),
    answeredAt: new Date(MOCK_BASE_TIME - 3540000).toISOString(),
    endedAt: new Date(MOCK_BASE_TIME - 3000000).toISOString(),
    duration: 600,
    participant: { id: "user1", username: "sweetheart" },
  },
  {
    id: "2",
    callId: "call-2",
    callerId: "user2",
    calleeId: "current-user",
    media: "audio" as const,
    status: "ended" as const,
    offeredAt: new Date(MOCK_BASE_TIME - 86400000).toISOString(),
    answeredAt: new Date(MOCK_BASE_TIME - 86400000 + 60000).toISOString(),
    endedAt: new Date(MOCK_BASE_TIME - 86400000 + 1800000).toISOString(),
    duration: 1800,
    participant: { id: "user2", username: "lovebug" },
  },
  {
    id: "3",
    callId: "call-3",
    callerId: "user3",
    calleeId: "current-user",
    media: "video" as const,
    status: "missed" as const,
    offeredAt: new Date(MOCK_BASE_TIME - 172800000).toISOString(),
    participant: { id: "user3", username: "myoneandonly" },
  },
];

export default function CallsPage() {
  const { initiateCall } = useCall();
  const { callHistory } = useCallsStore();
  const { data: callsData, isLoading } = useQuery<{ calls: CallHistoryItem[] }>(
    {
      queryKey: ["calls"],
      queryFn: async () => {
        const response = await apiFetch<{
          calls: CallHistoryItem[];
          nextCursor: string | null;
        }>("/api/calls");
        return response;
      },
    },
  );

  const calls =
    callsData?.calls || callHistory.length > 0 ? callHistory : mockCalls;

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

  const getDirectionIcon = (
    call: CallHistoryItem,
    currentUserId: string = "current-user",
  ) => {
    const isOutgoing = call.callerId === currentUserId;
    if (call.status === "missed") {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    if (isOutgoing) {
      return <PhoneOutgoing className="w-4 h-4 text-blue-500" />;
    }
    return <PhoneIncoming className="w-4 h-4 text-green-500" />;
  };

  const getCallDirection = (
    call: CallHistoryItem,
    currentUserId: string = "current-user",
  ) => {
    const isOutgoing = call.callerId === currentUserId;
    if (call.status === "missed") return "missed";
    return isOutgoing ? "outgoing" : "incoming";
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Calls</h1>
        <p className="text-gray-500 mt-1">Your call history 📞</p>
      </div>

      {/* Quick Actions - Note: These would typically show a contact picker, for demo we'll call the first contact */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => {
            if (calls.length > 0) {
              initiateCall(calls[0].participant.id, "audio");
            }
          }}
          className="flex items-center justify-center gap-2 p-4 bg-linear-to-r from-rose-500 to-pink-500 text-white rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
        >
          <Phone className="w-5 h-5" />
          <span className="font-semibold">Voice Call</span>
        </button>
        <button
          onClick={() => {
            if (calls.length > 0) {
              initiateCall(calls[0].participant.id, "video");
            }
          }}
          className="flex items-center justify-center gap-2 p-4 bg-linear-to-r from-rose-500 to-pink-500 text-white rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-200"
        >
          <Video className="w-5 h-5" />
          <span className="font-semibold">Video Call</span>
        </button>
      </div>

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
                          {call.participant.username}
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
                      onClick={() =>
                        initiateCall(call.participant.id, call.media)
                      }
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
      </div>
    </div>
  );
}
