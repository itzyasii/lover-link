"use client";

import { useFcm } from "@/hooks/useFcm";

export const NotificationPermission = () => {
  const { notificationPermission, requestNotificationPermission } = useFcm();

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
