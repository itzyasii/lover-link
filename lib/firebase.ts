import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  MessagePayload,
} from "firebase/messaging";
import { API_BASE_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const messaging =
  typeof window !== "undefined" ? getMessaging(app) : null;

// Register FCM token with backend
export const registerFcmTokenWithBackend = async (
  token: string,
): Promise<boolean> => {
  try {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      console.warn("Cannot register FCM token: User not authenticated");
      return false;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/notifications/fcm/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ token }),
      },
    );

    if (!response.ok) {
      console.error("Failed to register FCM token with backend");
      return false;
    }

    console.log("FCM token registered successfully");
    return true;
  } catch (error) {
    console.error("Error registering FCM token:", error);
    return false;
  }
};

// Unregister FCM token from backend (call on logout)
export const unregisterFcmTokenFromBackend = async (
  token: string,
): Promise<boolean> => {
  try {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      console.warn("Cannot unregister FCM token: User not authenticated");
      return false;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/notifications/fcm/unregister`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ token }),
      },
    );

    if (!response.ok) {
      console.error("Failed to unregister FCM token from backend");
      return false;
    }

    console.log("FCM token unregistered successfully");
    return true;
  } catch (error) {
    console.error("Error unregistering FCM token:", error);
    return false;
  }
};

export const getFcmToken = async () => {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error("VAPID key is not configured.");
      return null;
    }
    if (!messaging) {
      return null;
    }
    const currentToken = await getToken(messaging, { vapidKey });
    if (currentToken) {
      return currentToken;
    } else {
      console.log(
        "No registration token available. Request permission to generate one.",
      );
      return null;
    }
  } catch (err) {
    console.error("An error occurred while retrieving token. ", err);
    return null;
  }
};

// Note: onTokenRefresh is deprecated in newer Firebase versions.
// Token refresh is now handled automatically by the Firebase SDK.
// The getToken() method will always return a valid token when called.

// Listen for foreground messages
export const onMessageListener = (
  callback: (payload: MessagePayload) => void,
) => {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log("Received foreground message:", payload);

    // Show in-app browser notification if permission is granted
    if (Notification.permission === "granted") {
      new Notification(payload.notification?.title || "New Notification", {
        body: payload.notification?.body,
        icon: "/logo.svg",
        badge: "/logo.svg",
      });
    }

    callback(payload);
  });
};
