"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api";

export interface FriendUser {
  id: string;
  email: string;
  username: string;
  lastSeenAt?: string;
}

export interface PendingRequests {
  incoming: FriendUser[];
  outgoing: FriendUser[];
}

export interface BlockRecord {
  userId: string;
  reason?: string;
  createdAt: string;
}

interface FriendsState {
  friends: FriendUser[];
  pendingRequests: PendingRequests;
  blockedUsers: BlockRecord[];
  searchResults: FriendUser[];
}

interface FriendsActions {
  setFriends: (friends: FriendUser[]) => void;
  setPendingRequests: (requests: PendingRequests) => void;
  setBlockedUsers: (blocked: BlockRecord[]) => void;
  setSearchResults: (results: FriendUser[]) => void;
  addFriend: (user: FriendUser) => void;
  removeFriend: (userId: string) => void;
  addIncomingRequest: (user: FriendUser) => void;
  removeIncomingRequest: (userId: string) => void;
  addOutgoingRequest: (user: FriendUser) => void;
  removeOutgoingRequest: (userId: string) => void;
  addBlockedUser: (userId: string, reason?: string) => void;
  removeBlockedUser: (userId: string) => void;
  clearSearchResults: () => void;
  reset: () => void;

  // API Methods
  fetchFriends: () => Promise<void>;
  fetchPendingRequests: () => Promise<void>;
  searchUsers: (query: string) => Promise<void>;
  sendFriendRequest: (toUserId: string) => Promise<void>;
  acceptFriendRequest: (fromUserId: string) => Promise<void>;
  rejectFriendRequest: (fromUserId: string) => Promise<void>;
  cancelFriendRequest: (toUserId: string) => Promise<void>;
  unfriendUser: (userId: string) => Promise<void>;
  blockUser: (userId: string, reason?: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  reportUser: (
    userId: string,
    reason: string,
    details?: string,
  ) => Promise<void>;
}

const initialState: FriendsState = {
  friends: [],
  pendingRequests: { incoming: [], outgoing: [] },
  blockedUsers: [],
  searchResults: [],
};

export const useFriendsStore = create<FriendsState & FriendsActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setFriends: (friends) => set({ friends }),
      setPendingRequests: (pendingRequests) => set({ pendingRequests }),
      setBlockedUsers: (blockedUsers) => set({ blockedUsers }),
      setSearchResults: (searchResults) => set({ searchResults }),

      addFriend: (user) => {
        set((state) => ({ friends: [...state.friends, user] }));
      },

      removeFriend: (userId) => {
        set((state) => ({
          friends: state.friends.filter((f) => f.id !== userId),
        }));
      },

      addIncomingRequest: (user) => {
        set((state) => ({
          pendingRequests: {
            ...state.pendingRequests,
            incoming: [...state.pendingRequests.incoming, user],
          },
        }));
      },

      removeIncomingRequest: (userId) => {
        set((state) => ({
          pendingRequests: {
            ...state.pendingRequests,
            incoming: state.pendingRequests.incoming.filter(
              (u) => u.id !== userId,
            ),
          },
        }));
      },

      addOutgoingRequest: (user) => {
        set((state) => ({
          pendingRequests: {
            ...state.pendingRequests,
            outgoing: [...state.pendingRequests.outgoing, user],
          },
        }));
      },

      removeOutgoingRequest: (userId) => {
        set((state) => ({
          pendingRequests: {
            ...state.pendingRequests,
            outgoing: state.pendingRequests.outgoing.filter(
              (u) => u.id !== userId,
            ),
          },
        }));
      },

      addBlockedUser: (userId, reason) => {
        set((state) => ({
          blockedUsers: [
            ...state.blockedUsers,
            {
              userId,
              reason,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      },

      removeBlockedUser: (userId) => {
        set((state) => ({
          blockedUsers: state.blockedUsers.filter((b) => b.userId !== userId),
        }));
      },

      clearSearchResults: () => set({ searchResults: [] }),

      reset: () => set(initialState),

      // API Implementation with proper error handling following USERS-FRIENDS-REALTIME-GUIDE
      fetchFriends: async () => {
        try {
          const res: Response = await apiFetch("/api/users/friends");
          const data = await res.json();
          if (data.ok) {
            set({ friends: data.friends });
          } else {
            throw new Error(data.error || "Failed to fetch friends");
          }
        } catch (error) {
          console.error("[Friends] fetchFriends error:", error);
          throw error;
        }
      },

      fetchPendingRequests: async () => {
        try {
          const res: Response = await apiFetch("/api/users/friends/requests");
          const data = await res.json();
          if (data.ok) {
            set({
              pendingRequests: {
                incoming: data.incoming,
                outgoing: data.outgoing,
              },
            });
          } else {
            throw new Error(data.error || "Failed to fetch pending requests");
          }
        } catch (error) {
          console.error("[Friends] fetchPendingRequests error:", error);
          throw error;
        }
      },

      searchUsers: async (query: string) => {
        try {
          const res: Response = await apiFetch(
            `/api/users/search?q=${encodeURIComponent(query)}`,
          );
          const data = await res.json();
          if (data.ok) {
            set({ searchResults: data.users });
          } else {
            throw new Error(data.error || "Failed to search users");
          }
        } catch (error) {
          console.error("[Friends] searchUsers error:", error);
          throw error;
        }
      },

      sendFriendRequest: async (toUserId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/friends/request", {
            method: "POST",
            body: JSON.stringify({ toUserId }),
          });
          const data = await res.json();
          if (data.ok) {
            const targetUser = get().searchResults.find(
              (u) => u.id === toUserId,
            );
            if (targetUser) {
              get().addOutgoingRequest(targetUser);
            }
          } else {
            throw new Error(data.error || "Failed to send friend request");
          }
        } catch (error) {
          console.error("[Friends] sendFriendRequest error:", error);
          throw error;
        }
      },

      acceptFriendRequest: async (fromUserId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/friends/accept", {
            method: "POST",
            body: JSON.stringify({ fromUserId }),
          });
          const data = await res.json();
          if (data.ok) {
            const incomingUser = get().pendingRequests.incoming.find(
              (u) => u.id === fromUserId,
            );
            if (incomingUser) {
              get().removeIncomingRequest(fromUserId);
              get().addFriend(incomingUser);
            }
          } else {
            throw new Error(data.error || "Failed to accept friend request");
          }
        } catch (error) {
          console.error("[Friends] acceptFriendRequest error:", error);
          throw error;
        }
      },

      rejectFriendRequest: async (fromUserId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/friends/reject", {
            method: "POST",
            body: JSON.stringify({ fromUserId }),
          });
          const data = await res.json();
          if (data.ok) {
            get().removeIncomingRequest(fromUserId);
          } else {
            throw new Error(data.error || "Failed to reject friend request");
          }
        } catch (error) {
          console.error("[Friends] rejectFriendRequest error:", error);
          throw error;
        }
      },

      cancelFriendRequest: async (toUserId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/friends/cancel", {
            method: "POST",
            body: JSON.stringify({ toUserId }),
          });
          const data = await res.json();
          if (data.ok) {
            get().removeOutgoingRequest(toUserId);
          } else {
            throw new Error(data.error || "Failed to cancel friend request");
          }
        } catch (error) {
          console.error("[Friends] cancelFriendRequest error:", error);
          throw error;
        }
      },

      unfriendUser: async (userId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/friends/unfriend", {
            method: "POST",
            body: JSON.stringify({ userId }),
          });
          const data = await res.json();
          if (data.ok) {
            get().removeFriend(userId);
          } else {
            throw new Error(data.error || "Failed to unfriend user");
          }
        } catch (error) {
          console.error("[Friends] unfriendUser error:", error);
          throw error;
        }
      },

      blockUser: async (userId: string, reason?: string) => {
        try {
          const res: Response = await apiFetch("/api/users/block", {
            method: "POST",
            body: JSON.stringify({ userId, reason }),
          });
          const data = await res.json();
          if (data.ok) {
            // Remove from friends and requests as per guide
            get().removeFriend(userId);
            get().removeIncomingRequest(userId);
            get().removeOutgoingRequest(userId);
            get().addBlockedUser(userId, reason);
          } else {
            throw new Error(data.error || "Failed to block user");
          }
        } catch (error) {
          console.error("[Friends] blockUser error:", error);
          throw error;
        }
      },

      unblockUser: async (userId: string) => {
        try {
          const res: Response = await apiFetch("/api/users/unblock", {
            method: "POST",
            body: JSON.stringify({ userId }),
          });
          const data = await res.json();
          if (data.ok) {
            get().removeBlockedUser(userId);
          } else {
            throw new Error(data.error || "Failed to unblock user");
          }
        } catch (error) {
          console.error("[Friends] unblockUser error:", error);
          throw error;
        }
      },

      reportUser: async (userId: string, reason: string, details?: string) => {
        try {
          const res: Response = await apiFetch("/api/users/report", {
            method: "POST",
            body: JSON.stringify({ userId, reason, details }),
          });
          const data = await res.json();
          if (!data.ok) {
            throw new Error(data.error || "Failed to submit report");
          }
        } catch (error) {
          console.error("[Friends] reportUser error:", error);
          throw error;
        }
      },
    }),
    {
      name: "friends-storage",
    },
  ),
);
