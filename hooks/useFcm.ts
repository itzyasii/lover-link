import { useState, useEffect, useCallback } from "react";
import {
  getFcmToken,
  registerFcmTokenWithBackend,
  unregisterFcmTokenFromBackend,
  getStoredFcmToken,
  deleteFcmToken,
  requestNotifications,
} from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth";

type NotificationPermission = "default" | "denied" | "granted";

const getInitialPermission = (): NotificationPermission => {
  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission;
  }
  return "default";
};

export const useFcm = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isTokenRegistered, setIsTokenRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(getInitialPermission());

  // Sync with stored token from firebase.ts
  useEffect(() => {
    const storedToken = getStoredFcmToken();
    if (storedToken && !token) {
      setToken(storedToken);
    }
  }, []);

  // Get token if permission is already granted on mount
  useEffect(() => {
    const getExistingToken = async () => {
      if (notificationPermission === "granted" && !token) {
        setIsLoading(true);
        try {
          const fcmToken = await getFcmToken();
          if (fcmToken) {
            setToken(fcmToken);
          }
        } finally {
          setIsLoading(false);
        }
      }
    };
    getExistingToken();
  }, [notificationPermission, token]);

  // Auto-register token when user is authenticated and we have a token
  useEffect(() => {
    const registerToken = async () => {
      if (token && accessToken && !isTokenRegistered) {
        setIsLoading(true);
        try {
          const success = await registerFcmTokenWithBackend(token);
          setIsTokenRegistered(success);
        } finally {
          setIsLoading(false);
        }
      }
    };
    registerToken();
  }, [token, accessToken, isTokenRegistered]);

  // Unregister token when user logs out
  useEffect(() => {
    if (!accessToken && token && isTokenRegistered) {
      unregisterFcmTokenFromBackend(token).then(() => {
        setIsTokenRegistered(false);
      });
    }
  }, [accessToken, token, isTokenRegistered]);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.warn("[FCM] This browser does not support desktop notifications");
      return null;
    }

    setIsLoading(true);
    try {
      const fcmToken = await requestNotifications();
      if (fcmToken) {
        setToken(fcmToken);
        setNotificationPermission("granted");
        setIsTokenRegistered(false); // Reset to trigger registration
      } else {
        setNotificationPermission(Notification.permission);
      }
      return fcmToken;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manual registration function that can be called after login if needed
  const registerCurrentToken = useCallback(async (): Promise<boolean> => {
    if (!token || !accessToken) {
      return false;
    }

    setIsLoading(true);
    try {
      const success = await registerFcmTokenWithBackend(token);
      setIsTokenRegistered(success);
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [token, accessToken]);

  // Unregister current token
  const unregisterCurrentToken = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    setIsLoading(true);
    try {
      const success = await unregisterFcmTokenFromBackend(token);
      if (success) {
        setIsTokenRegistered(false);
        setToken(null);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Delete token completely
  const removeToken = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await deleteFcmToken();
      if (success) {
        setToken(null);
        setIsTokenRegistered(false);
      }
      return success;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    token,
    notificationPermission,
    requestNotificationPermission,
    registerCurrentToken,
    unregisterCurrentToken,
    removeToken,
    isTokenRegistered,
    isLoading,
  };
};
