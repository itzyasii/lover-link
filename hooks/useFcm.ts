import { useState } from "react";
import { getFcmToken } from "@/lib/firebase";

type NotificationPermission = "default" | "denied" | "granted";

const getInitialPermission = (): NotificationPermission => {
  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission;
  }
  return "default";
};

export const useFcm = () => {
  const [token, setToken] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(getInitialPermission());

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return null;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        setToken(fcmToken);
        return fcmToken;
      }
    }
    return null;
  };

  return { token, notificationPermission, requestNotificationPermission };
};
