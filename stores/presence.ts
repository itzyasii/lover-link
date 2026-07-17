"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api";

export interface PresenceUser {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string;
}

interface PresenceState {
  onlineUsers: Map<string, PresenceUser>;
}

interface PresenceActions {
  setInitialOnlineUsers: (userIds: string[]) => void;
  updatePresence: (userIds: string[]) => void;
  updateUserLastSeen: (userId: string, lastSeenAt: string) => void;
  getUserPresence: (userId: string) => PresenceUser | undefined;
  getOnlineUsers: () => string[];
  clearPresence: () => void;

  // API methods from USERS-FRIENDS-REALTIME-GUIDE
  fetchPresence: (userIds: string[]) => Promise<void>;
}

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const isValidObjectId = (id: string) => OBJECT_ID_REGEX.test(id);

const initialState: PresenceState = {
  onlineUsers: new Map(),
};

export const usePresenceStore = create<PresenceState & PresenceActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setInitialOnlineUsers: (userIds) => {
        const onlineUsers = new Map(get().onlineUsers);
        userIds.forEach((userId) => {
          onlineUsers.set(userId, {
            userId,
            isOnline: true,
            lastSeenAt: new Date().toISOString(),
          });
        });
        set({ onlineUsers });
      },

      updatePresence: (userIds) => {
        const onlineUsers = new Map(get().onlineUsers);
        const currentUserIds = Array.from(onlineUsers.keys());

        // Mark previously online users as offline
        currentUserIds.forEach((userId) => {
          if (!userIds.includes(userId)) {
            const existing = onlineUsers.get(userId);
            if (existing) {
              onlineUsers.set(userId, {
                ...existing,
                isOnline: false,
                lastSeenAt: new Date().toISOString(),
              });
            }
          }
        });

        // Mark current users as online
        userIds.forEach((userId) => {
          const existing = onlineUsers.get(userId);
          if (existing) {
            onlineUsers.set(userId, { ...existing, isOnline: true });
          } else {
            onlineUsers.set(userId, {
              userId,
              isOnline: true,
              lastSeenAt: new Date().toISOString(),
            });
          }
        });

        set({ onlineUsers });
      },

      updateUserLastSeen: (userId, lastSeenAt) => {
        const onlineUsers = new Map(get().onlineUsers);
        const existing = onlineUsers.get(userId);
        if (existing) {
          onlineUsers.set(userId, { ...existing, lastSeenAt });
        } else {
          onlineUsers.set(userId, { userId, isOnline: false, lastSeenAt });
        }
        set({ onlineUsers });
      },

      getUserPresence: (userId) => {
        return get().onlineUsers.get(userId);
      },

      getOnlineUsers: () => {
        return Array.from(get().onlineUsers.entries())
          .filter(([_, presence]) => presence.isOnline)
          .map(([userId]) => userId);
      },

      clearPresence: () => {
        set({ onlineUsers: new Map() });
      },

      // Fetch presence data from API following USERS-FRIENDS-REALTIME-GUIDE
      fetchPresence: async (userIds: string[]) => {
        try {
          // Filter out invalid ObjectIds
          const validIds = userIds.filter((id) => isValidObjectId(id));
          if (validIds.length === 0) return;

          const data = await apiFetch<{
            ok: boolean;
            presence: PresenceUser[];
          }>(`/api/users/presence?ids=${validIds.join(",")}`);

          if (data.ok && data.presence) {
            const onlineUsers = new Map(get().onlineUsers);

            // Update presence for all users from API response
            data.presence.forEach((presence: PresenceUser) => {
              onlineUsers.set(presence.userId, presence);
            });

            set({ onlineUsers });
          }
        } catch (error) {
          console.error("[Presence] fetchPresence error:", error);
        }
      },
    }),
    {
      name: "presence-storage",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              onlineUsers: new Map(parsed.state.onlineUsers),
            },
          };
        },
        setItem: (name, value) => {
          const str = JSON.stringify({
            ...value,
            state: {
              ...value.state,
              onlineUsers: Array.from(value.state.onlineUsers.entries()),
            },
          });
          localStorage.setItem(name, str);
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
