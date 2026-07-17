import { initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  Messaging,
  MessagePayload,
} from "firebase/messaging";
import { env } from "./env";
import { useAuthStore } from "@/stores/auth";

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
};

let messaging: Messaging | null = null;

export function initializeFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    console.log("[Firebase] Initialized successfully");
    return true;
  } catch (error) {
    console.error("[Firebase] Failed to initialize:", error);
    return false;
  }
}

export async function requestNotificationPermission(): Promise<string | null> {
  if (!messaging) {
    console.warn("[Firebase] Messaging not initialized");
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: env.FIREBASE_VAPID_KEY,
      });
      if (token) {
        useAuthStore.getState().setFcmToken(token);
        return token;
      }
    }
    return null;
  } catch (error) {
    console.error("[Firebase] Failed to get notification permission:", error);
    return null;
  }
}

export function setupForegroundMessages(
  callback: (payload: MessagePayload) => void,
) {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log("[Firebase] Foreground message received:", payload);
    callback(payload);
  });
}

export function getMessagingInstance(): Messaging | null {
  return messaging;
}
