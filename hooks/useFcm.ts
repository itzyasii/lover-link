import { useState, useEffect } from "react";
import { getFcmToken, registerFcmTokenWithBackend } from "@/lib/firebase";
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
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(getInitialPermission());

  // Get token if permission is already granted on mount
  useEffect(() => {
    const getExistingToken = async () => {
      if (notificationPermission === "granted" && !token) {
        const fcmToken = await getFcmToken();
        if (fcmToken) {
          setToken(fcmToken);
        }
      }
    };
    getExistingToken();
  }, [notificationPermission]);

  // Auto-register token when user is authenticated and we have a token
  useEffect(() => {
    if (token && accessToken && !isTokenRegistered) {
      registerFcmTokenWithBackend(token).then((success) => {
        if (success) {
          setIsTokenRegistered(true);
        }
      });
    }
  }, [token, accessToken, isTokenRegistered]);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return null;
    }

    // If permission is already granted, just return the existing token or get it
    if (Notification.permission === "granted") {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        setToken(fcmToken);
        setIsTokenRegistered(false);
        return fcmToken;
      }
      return null;
    }

    // Otherwise request permission
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        setToken(fcmToken);
        setIsTokenRegistered(false); // Reset to trigger registration
        return fcmToken;
      }
    }
    return null;
  };

  // Manual registration function that can be called after login if needed
  const registerCurrentToken = async (): Promise<boolean> => {
    if (token && accessToken) {
      const success = await registerFcmTokenWithBackend(token);
      if (success) {
        setIsTokenRegistered(true);
      }
      return success;
    }
    return false;
  };

  return {
    token,
    notificationPermission,
    requestNotificationPermission,
    registerCurrentToken,
    isTokenRegistered,
  };
};
