"use client";

import { useEffect, useState, useCallback } from "react";
import {
  initializeFirebase,
  requestNotificationPermission,
  setupForegroundMessages,
} from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth";
import {  } from "@/lib/api";
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
      console.log(
        "[FCM] Token obtained, will be sent to server during auth operations",
      );
      useAuthStore.getState().setFcmToken(token);
    }
  }, []);

  // Note: FCM token management is handled by the backend auth endpoints
  // during login, signup, and logout as per the backend integration guide

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
  };
}
