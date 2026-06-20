"use client";

import { useEffect } from "react";
import { useFcm } from "@/hooks/useFcm";
import { useAuthStore } from "@/stores/auth";

export const NotificationPermission = () => {
  const {
    notificationPermission,
    requestNotificationPermission,
    token,
    registerCurrentToken,
    isTokenRegistered,
  } = useFcm();
  const accessToken = useAuthStore((s) => s.accessToken);

  // If we already have a token but it's not registered, try to register it
  useEffect(() => {
    if (
      notificationPermission === "granted" &&
      token &&
      accessToken &&
      !isTokenRegistered
    ) {
      registerCurrentToken();
    }
  }, [
    notificationPermission,
    token,
    accessToken,
    isTokenRegistered,
    registerCurrentToken,
  ]);

  // Don't show the prompt if permission is already granted
  if (notificationPermission === "granted") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="rounded-lg border bg-white p-4 shadow-lg">
        <p className="mb-2">Enable notifications to receive alerts.</p>
        <button
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={requestNotificationPermission}
        >
          Enable Notifications
        </button>
      </div>
    </div>
  );
};
