"use client";

import { useEffect, useState, useCallback } from "react";
import {
  initializeFirebase,
  requestNotificationPermission,
  setupForegroundMessages,
} from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth";
import { apiFetch } from "@/lib/api";
import { useToastStore } from "@/stores/toast";

export function useFcm() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const { fcmToken, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    const init = async () => {
      const initialized = initializeFirebase();
      setIsInitialized(initialized);

      if (initialized) {
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
      setPermissionGranted(true);
      try {
        await apiFetch("/api/notifications/fcm/register", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        console.log("[FCM] Token registered with server");
        useAuthStore.getState().setFcmToken(token);
      } catch (error) {
        console.error("[FCM] Failed to register token:", error);
      }
    }
  }, []);

  const unregisterFcmToken = useCallback(async () => {
    const currentFcmToken = useAuthStore.getState().fcmToken;
    const currentIsAuthenticated = useAuthStore.getState().isAuthenticated;
    if (currentFcmToken && currentIsAuthenticated) {
      try {
        await apiFetch("/api/notifications/fcm/unregister", {
          method: "POST",
          body: JSON.stringify({ token: currentFcmToken }),
        });
        useAuthStore.getState().setFcmToken(null);
      } catch (error) {
        console.error("[FCM] Failed to unregister token:", error);
      }
    }
  }, []);

  const clearAllFcmTokens = useCallback(async () => {
    const currentIsAuthenticated = useAuthStore.getState().isAuthenticated;
    if (currentIsAuthenticated) {
      try {
        await apiFetch("/api/notifications/fcm/clear-all", {
          method: "POST",
        });
        useAuthStore.getState().setFcmToken(null);
      } catch (error) {
        console.error("[FCM] Failed to clear all tokens:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (isInitialized && isAuthenticated && !fcmToken) {
      // Use queueMicrotask to avoid calling setState synchronously in effect
      queueMicrotask(() => {
        registerFcmToken();
      });
    }
  }, [isInitialized, isAuthenticated, fcmToken, registerFcmToken]);

  return {
    isInitialized,
    permissionGranted,
    fcmToken,
    registerFcmToken,
    unregisterFcmToken,
    clearAllFcmTokens,
  };
}
