import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  MessagePayload,
  deleteToken,
} from "firebase/messaging";
import { API_BASE_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";

// Firebase configuration with all required fields
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: "G-V4Q9EFJ80F", // Added measurement ID for completeness
};

// Initialize Firebase app properly with singleton pattern
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize messaging only on client side
export const messaging =
  typeof window !== "undefined" ? getMessaging(app) : null;

// Store current FCM token in memory to track it across the app
let currentFcmToken: string | null = null;

/**
 * Register FCM token with backend
 * @param token FCM token to register
 * @returns boolean indicating success
 */
export const registerFcmTokenWithBackend = async (
  token: string,
): Promise<boolean> => {
  try {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      console.warn("[FCM] Cannot register FCM token: User not authenticated");
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
      console.error(
        "[FCM] Failed to register FCM token with backend, status:",
        response.status,
      );
      return false;
    }

    currentFcmToken = token;
    console.log("[FCM] FCM token registered successfully");
    return true;
  } catch (error) {
    console.error("[FCM] Error registering FCM token:", error);
    return false;
  }
};

/**
 * Unregister FCM token from backend (call on logout)
 * @param token Optional FCM token to unregister, uses stored token if not provided
 * @returns boolean indicating success
 */
export const unregisterFcmTokenFromBackend = async (
  token?: string,
): Promise<boolean> => {
  const tokenToUnregister = token || currentFcmToken;

  try {
    if (!tokenToUnregister) {
      console.warn("[FCM] No FCM token to unregister");
      return false;
    }

    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      console.warn("[FCM] Cannot unregister FCM token: User not authenticated");
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
        body: JSON.stringify({ token: tokenToUnregister }),
      },
    );

    if (!response.ok) {
      console.error(
        "[FCM] Failed to unregister FCM token from backend, status:",
        response.status,
      );
      return false;
    }

    currentFcmToken = null;
    console.log("[FCM] FCM token unregistered successfully");
    return true;
  } catch (error) {
    console.error("[FCM] Error unregistering FCM token:", error);
    return false;
  }
};

/**
 * Get current FCM token, request if not available
 * @returns FCM token or null if failed
 */
export const getFcmToken = async (): Promise<string | null> => {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error(
        "[FCM] VAPID key is not configured in environment variables",
      );
      return null;
    }

    if (!messaging) {
      console.warn("[FCM] Messaging is not initialized (running on server)");
      return null;
    }

    // First check if we already have a token
    if (currentFcmToken) {
      return currentFcmToken;
    }

    // Request new token from Firebase
    const token = await getToken(messaging, { vapidKey });
    if (token) {
      currentFcmToken = token;
      console.log("[FCM] FCM token retrieved successfully");
      return token;
    } else {
      console.log(
        "[FCM] No registration token available. Notification permission may be denied.",
      );
      return null;
    }
  } catch (err) {
    console.error("[FCM] An error occurred while retrieving token:", err);
    return null;
  }
};

/**
 * Delete FCM token from Firebase and backend
 * @returns boolean indicating success
 */
export const deleteFcmToken = async (): Promise<boolean> => {
  try {
    if (!messaging || !currentFcmToken) {
      return false;
    }

    // First unregister from backend
    await unregisterFcmTokenFromBackend();

    // Delete from Firebase
    const success = await deleteToken(messaging);
    if (success) {
      currentFcmToken = null;
      console.log("[FCM] FCM token deleted successfully");
    }
    return success;
  } catch (err) {
    console.error("[FCM] Error deleting FCM token:", err);
    return false;
  }
};

/**
 * Get the current stored FCM token
 * @returns Current FCM token or null
 */
export const getStoredFcmToken = (): string | null => {
  return currentFcmToken;
};

/**
 * Setup listener for foreground messages
 * @param callback Function to call when message is received
 * @returns Cleanup function to remove listener
 */
export const onMessageListener = (
  callback: (payload: MessagePayload) => void,
) => {
  if (!messaging) {
    console.warn(
      "[FCM] Cannot setup message listener: messaging not initialized",
    );
    return () => {};
  }

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("[FCM] Received foreground message:", payload);

    // Show in-app browser notification if permission is granted
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(payload.notification?.title || "New Notification", {
        body: payload.notification?.body,
        icon: "/logo.svg",
        badge: "/logo.svg",
        data: payload.data,
        tag: payload.data?.type || "default",
      });
    }

    callback(payload);
  });

  return unsubscribe;
};

/**
 * Register service worker for Firebase messaging
 * Call this once when the app loads
 */
export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("[FCM] Service workers are not supported in this browser");
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
        {
          scope: "/",
        },
      );
      console.log(
        "[FCM] ServiceWorker registration successful:",
        registration.scope,
      );
      return registration;
    } catch (err) {
      console.error("[FCM] ServiceWorker registration failed:", err);
      return null;
    }
  };

/**
 * Request notification permission and get FCM token
 * @returns FCM token or null if failed
 */
export const requestNotifications = async (): Promise<string | null> => {
  if (!("Notification" in window)) {
    console.error("[FCM] This browser does not support notifications");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getFcmToken();
      if (token) {
        // Auto-register with backend if user is authenticated
        const accessToken = useAuthStore.getState().accessToken;
        if (accessToken) {
          await registerFcmTokenWithBackend(token);
        }
        return token;
      }
    } else {
      console.warn("[FCM] Notification permission denied by user");
    }
    return null;
  } catch (error) {
    console.error("[FCM] Error requesting notifications:", error);
    return null;
  }
};
