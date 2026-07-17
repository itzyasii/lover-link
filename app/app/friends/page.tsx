"use client";

import { useState, useEffect } from "react";
import {
  Search,
  UserPlus,
  Users,
  Heart,
  Check,
  X,
  Shield,
  Flag,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";
import { useFriendsStore } from "@/stores/friends";
import { usePresenceStore } from "@/stores/presence";
import { HeartbeatLoading } from "@/components/HeartbeatLoading";
import { apiFetch } from "@/lib/api";

// Zod validation for ObjectId as per the guide
const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const isValidObjectId = (id: string) => OBJECT_ID_REGEX.test(id);

import type { FriendUser } from "@/stores/friends";

// React Query fetchers following project patterns
const fetchFriendsQuery = async (): Promise<FriendUser[]> => {
  const data: { ok: boolean; error?: string; friends: FriendUser[] } =
    await apiFetch("/api/users/friends");
  if (!data.ok) throw new Error(data.error || "Failed to fetch friends");
  return data.friends;
};

const fetchPendingRequestsQuery = async () => {
  const data: {
    ok: boolean;
    error?: string;
    incoming: FriendUser[];
    outgoing: FriendUser[];
  } = await apiFetch("/api/users/friends/requests");
  if (!data.ok) throw new Error(data.error || "Failed to fetch requests");
  return { incomingRequests: data.incoming, outgoingRequests: data.outgoing };
};

export default function FriendsPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const {
    friends,
    pendingRequests,
    searchResults,
    blockedUsers,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    unfriendUser,
    blockUser,
    unblockUser,
    reportUser,
    clearSearchResults,
  } = useFriendsStore();
  const { getUserPresence, fetchPresence } = usePresenceStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState<string | null>(null);

  // Use React Query for data fetching following existing project patterns
  const { data: friendsData, isLoading: friendsLoading } = useQuery({
    queryKey: ["friends"],
    queryFn: fetchFriendsQuery,
  });

  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ["friends", "requests"],
    queryFn: fetchPendingRequestsQuery,
  });

  // Update Zustand store when React Query data changes
  useEffect(() => {
    if (friendsData) {
      useFriendsStore.getState().setFriends(friendsData);
      // Fetch presence for all friends
      const friendIds = friendsData.map((f: { id: string }) => f.id);
      if (friendIds.length > 0) {
        fetchPresence(friendIds);
      }
    }
  }, [friendsData, fetchPresence]);

  useEffect(() => {
    if (requestsData) {
      useFriendsStore.getState().setPendingRequests({
        incoming: requestsData.incomingRequests,
        outgoing: requestsData.outgoingRequests,
      });
    }
  }, [requestsData]);

  const isLoading = friendsLoading || requestsLoading;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      await searchUsers(searchQuery);
    } catch {
      addToast("Search failed", "error");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (toUserId: string) => {
    if (!isValidObjectId(toUserId)) {
      addToast("Invalid user ID", "error");
      return;
    }
    if (toUserId === user?.id) {
      addToast("Cannot send request to yourself", "error");
      return;
    }
    try {
      await sendFriendRequest(toUserId);
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
      addToast("Friend request sent! 💌", "success");
      clearSearchResults();
      setSearchQuery("");
    } catch {
      addToast("Failed to send request", "error");
    }
  };

  const handleAcceptRequest = async (fromUserId: string) => {
    try {
      await acceptFriendRequest(fromUserId);
      // Invalidate queries after successful mutation - following project patterns
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
      addToast("Friend request accepted! 💑", "success");
    } catch {
      addToast("Failed to accept request", "error");
    }
  };

  const handleRejectRequest = async (fromUserId: string) => {
    try {
      await rejectFriendRequest(fromUserId);
      // Invalidate queries after successful mutation
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
      addToast("Friend request rejected", "info");
    } catch {
      addToast("Failed to reject request", "error");
    }
  };

  const handleCancelRequest = async (toUserId: string) => {
    try {
      await cancelFriendRequest(toUserId);
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
      addToast("Friend request cancelled", "info");
    } catch {
      addToast("Failed to cancel request", "error");
    }
  };

  const handleBlockUser = async (userId: string) => {
    try {
      await blockUser(userId, blockReason || undefined);
      // Invalidate queries after successful mutation
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["friends", "requests"] });
      addToast("User blocked successfully", "success");
      setShowBlockModal(null);
      setBlockReason("");
    } catch {
      addToast("Failed to block user", "error");
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      await unblockUser(userId);
      addToast("User unblocked", "success");
    } catch {
      addToast("Failed to unblock user", "error");
    }
  };

  const handleReportUser = async (userId: string) => {
    if (reportReason.length < 3 || reportReason.length > 200) {
      addToast("Report reason must be 3-200 characters", "error");
      return;
    }
    try {
      await reportUser(userId, reportReason, reportDetails || undefined);
      addToast("Report submitted successfully", "success");
      setShowReportModal(null);
      setReportReason("");
      setReportDetails("");
    } catch {
      addToast("Failed to submit report", "error");
    }
  };

  const handleUnfriend = async (userId: string) => {
    try {
      await unfriendUser(userId);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      addToast("Unfriended successfully", "success");
    } catch {
      addToast("Failed to unfriend user", "error");
    }
  };

  if (isLoading) {
    return <HeartbeatLoading message="Loading your connections..." />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Friends</h1>
        <p className="text-gray-500 mt-1">Nurture your connections 💕</p>
      </div>

      {/* Search for new friends */}
      <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-rose-500" />
          Find new friends
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by username or email..."
            className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:border-rose-400 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2.5 bg-linear-to-r from-rose-500 to-pink-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((foundUser) => {
              const isOwnRequest = pendingRequests.outgoing.some(
                (u) => u.id === foundUser.id,
              );
              return (
                <div
                  key={foundUser.id}
                  className="flex items-center justify-between p-3 bg-rose-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white font-bold">
                      {foundUser.username[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {foundUser.username}
                      </p>
                      <p className="text-sm text-gray-500">{foundUser.email}</p>
                    </div>
                  </div>
                  {!isOwnRequest && (
                    <button
                      onClick={() => handleSendRequest(foundUser.id)}
                      className="px-3 py-1.5 bg-rose-500 text-white text-sm font-medium rounded-lg hover:bg-rose-600 transition-colors"
                    >
                      Add Friend
                    </button>
                  )}
                  {isOwnRequest && (
                    <span className="text-sm text-gray-500">Request sent</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Incoming Friend Requests */}
      {pendingRequests.incoming.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500" />
            Incoming Requests ({pendingRequests.incoming.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.incoming.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-pink-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-pink-400 to-rose-400 flex items-center justify-center text-white font-bold">
                    {request.username[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {request.username}
                    </p>
                    <p className="text-sm text-gray-500">{request.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    className="p-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing Friend Requests */}
      {pendingRequests.outgoing.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-300" />
            Pending Requests ({pendingRequests.outgoing.length})
          </h3>
          <div className="space-y-3">
            {pendingRequests.outgoing.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white font-bold">
                    {request.username[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {request.username}
                    </p>
                    <p className="text-sm text-gray-500">{request.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelRequest(request.id)}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Friends List */}
      <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-500" />
            Your Connections ({friends.length})
          </h3>
          <button
            onClick={() => setShowBlocked(!showBlocked)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Shield className="w-4 h-4" />
            {showBlocked ? "Hide Blocked" : "Show Blocked"}
          </button>
        </div>
        <div className="space-y-3">
          {friends.map((friend) => {
            const presence = getUserPresence(friend.id);
            return (
              <div
                key={friend.id}
                className="flex items-center justify-between p-3 bg-rose-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-rose-400 to-pink-400 flex items-center justify-center text-white font-bold">
                      {friend.username[0].toUpperCase()}
                    </div>
                    {presence?.isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {friend.username}
                    </p>
                    <p className="text-sm text-gray-500">
                      {presence?.isOnline
                        ? "Online"
                        : presence?.lastSeenAt
                          ? `Last seen ${new Date(presence.lastSeenAt).toLocaleDateString()}`
                          : "Offline"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReportModal(friend.id)}
                    className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                    title="Report user"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowBlockModal(friend.id)}
                    className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    title="Block user"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleUnfriend(friend.id)}
                    className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    title="Unfriend"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Block Modal */}
                {showBlockModal === friend.id && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-2xl max-w-md w-full mx-4">
                      <h3 className="text-xl font-bold mb-4">
                        Block {friend.username}?
                      </h3>
                      <textarea
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        placeholder="Reason for blocking (optional, max 500 chars)"
                        className="w-full p-3 border border-gray-200 rounded-xl mb-4 focus:outline-none focus:border-rose-400"
                        maxLength={500}
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowBlockModal(null);
                            setBlockReason("");
                          }}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleBlockUser(friend.id)}
                          className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium"
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Report Modal */}
                {showReportModal === friend.id && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-2xl max-w-md w-full mx-4">
                      <h3 className="text-xl font-bold mb-4">
                        Report {friend.username}
                      </h3>
                      <input
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        placeholder="Reason for reporting (3-200 chars)"
                        className="w-full p-3 border border-gray-200 rounded-xl mb-3 focus:outline-none focus:border-rose-400"
                        minLength={3}
                        maxLength={200}
                      />
                      <textarea
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="Additional details (optional, max 2000 chars)"
                        className="w-full p-3 border border-gray-200 rounded-xl mb-4 focus:outline-none focus:border-rose-400"
                        maxLength={2000}
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setShowReportModal(null);
                            setReportReason("");
                            setReportDetails("");
                          }}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReportUser(friend.id)}
                          className="flex-1 py-2.5 bg-yellow-500 text-white rounded-xl font-medium"
                        >
                          Submit Report
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Blocked Users Section */}
      {showBlocked && blockedUsers.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            Blocked Users ({blockedUsers.length})
          </h3>
          <div className="space-y-3">
            {blockedUsers.map((block) => (
              <div
                key={block.userId}
                className="flex items-center justify-between p-3 bg-red-50 rounded-xl"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    User ID: {block.userId}
                  </p>
                  {block.reason && (
                    <p className="text-sm text-gray-500">
                      Reason: {block.reason}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleUnblockUser(block.userId)}
                  className="px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
