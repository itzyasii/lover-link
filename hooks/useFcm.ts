"use client";

import { useEffect, useState, useCallback } from "react";
import {
  initializeFirebase,
  requestNotificationPermission,
  setupForegroundMessages,
} from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth";
import { useToastStore } from "@/stores/toast";

const NOTIFICATION_PERMISSION_STORAGE_KEY = "loverlink_notification_permission";

type PermissionStatus = "granted" | "denied" | "pending" | null;

function getStoredPermissionStatus(): PermissionStatus {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(NOTIFICATION_PERMISSION_STORAGE_KEY);
    return stored as PermissionStatus | null;
  } catch {
    return null;
  }
}

function setStoredPermissionStatus(status: PermissionStatus) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_PERMISSION_STORAGE_KEY, status || "");
  } catch {
    console.error("[FCM] Failed to store permission status");
  }
}

export function useFcm() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(
    getStoredPermissionStatus(),
  );
  const { fcmToken, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  // Expose a method to ensure FCM token is ready before auth operations
  const ensureFcmToken = useCallback(async (): Promise<string | null> => {
    // If we already have a token, return it immediately
    if (fcmToken) return fcmToken;

    // If Firebase isn't initialized yet, wait for initialization first
    if (!isInitialized) {
      // Wait a short time for initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Try to get the token if permission was already granted
    if ("Notification" in window && Notification.permission === "granted") {
      const token = await requestNotificationPermission();
      return token;
    }

    // If permission is pending, try to get it silently (won't show prompt)
    if (!permissionStatus || permissionStatus === "pending") {
      try {
        const token = await requestNotificationPermission();
        if (token) {
          setPermissionStatus("granted");
          setStoredPermissionStatus("granted");
          useAuthStore.getState().setFcmToken(token);
          return token;
        }
      } catch (e) {
        // If getting token fails, return null
        return null;
      }
    }

    return null;
  }, [fcmToken, isInitialized, permissionStatus]);

  useEffect(() => {
    const init = async () => {
      const initialized = initializeFirebase();
      setIsInitialized(initialized);

      if (initialized) {
        // Check browser's native permission status on initialization
        if ("Notification" in window) {
          const nativeStatus = Notification.permission;
          if (nativeStatus === "granted" || nativeStatus === "denied") {
            setPermissionStatus(nativeStatus);
            setStoredPermissionStatus(nativeStatus);

            // If permission is already granted, get the token immediately
            if (nativeStatus === "granted") {
              const token = await requestNotificationPermission();
              if (token) {
                useAuthStore.getState().setFcmToken(token);
              }
            }
          }
        }

        setupForegroundMessages((payload) => {
          addToast(payload.notification?.title || "New message", "info");
        });
      }
    };

    init();
  }, [addToast]);

  const registerFcmToken = useCallback(async () => {
    const token = await requestNotificationPermission();
    if (token) {
      setPermissionStatus("granted");
      setStoredPermissionStatus("granted");
      console.log(
        "[FCM] Token obtained, will be sent to server during auth operations",
      );
      useAuthStore.getState().setFcmToken(token);
      return token;
    } else {
      // If permission was denied, mark it as denied so we don't ask again
      setPermissionStatus("denied");
      setStoredPermissionStatus("denied");
      return null;
    }
  }, []);

  const dismissNotificationPrompt = useCallback(() => {
    setPermissionStatus("denied");
    setStoredPermissionStatus("denied");
  }, []);

  // Note: FCM token management is handled by the backend auth endpoints
  // during login, signup, and logout as per the backend integration guide

  useEffect(() => {
    if (isInitialized && isAuthenticated && !fcmToken && !permissionStatus) {
      // Only auto-register if we haven't asked before
      queueMicrotask(() => {
        registerFcmToken();
      });
    }
  }, [
    isInitialized,
    isAuthenticated,
    fcmToken,
    permissionStatus,
    registerFcmToken,
  ]);

  const permissionGranted = permissionStatus === "granted";
  const shouldShowPrompt =
    isInitialized && !permissionStatus && isAuthenticated;

  return {
    isInitialized,
    permissionGranted,
    shouldShowPrompt,
    fcmToken,
    registerFcmToken,
    ensureFcmToken,
    dismissNotificationPrompt,
  };
}
