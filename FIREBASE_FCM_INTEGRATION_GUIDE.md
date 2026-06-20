# Firebase FCM Integration Guide (Frontend)

This guide provides step-by-step instructions to integrate Firebase Cloud Messaging (FCM) push notifications into your frontend, fully aligned with the LoverLink backend structure.

## Prerequisites

1. A Firebase project created in the [Firebase Console](https://console.firebase.google.com/)
2. Firebase Admin SDK service account key configured on the backend (`serviceAccountKey.json`)
3. Backend already initialized with Firebase Admin (as seen in `src/config/firebase.ts`)

---

## 1. Frontend Firebase Setup

First, install required Firebase packages in your frontend project:

```bash
npm install firebase
```

### 1.1 Initialize Firebase in your frontend

Create a `firebase.ts` file in your frontend:

```typescript
import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

// Your web app's Firebase configuration (from Firebase Console > Project Settings)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123def456",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);
```

### 1.2 Get VAPID Public Key

In Firebase Console:

1. Go to **Project Settings > Cloud Messaging > Web Push certificates**
2. Copy your VAPID public key (required for requesting FCM tokens)

---

## 2. FCM Token Management

The backend supports FCM token registration through multiple endpoints. Follow this implementation to ensure proper token handling.

### 2.1 Register for Push Notifications

```typescript
import { getToken } from "firebase/messaging";
import { messaging } from "./firebase";

const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";

export async function registerPushNotifications(): Promise<string | null> {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
      console.log("FCM Token obtained:", token);
      return token;
    } else {
      console.warn("Notification permission denied by user");
      return null;
    }
  } catch (error) {
    console.error("Failed to register push notifications:", error);
    return null;
  }
}
```

### 2.2 Handle Token Refresh

FCM tokens can expire or refresh automatically. Always monitor for token updates:

```typescript
import { onTokenRefresh } from "firebase/messaging";
import { messaging } from "./firebase";

if (messaging) {
  onTokenRefresh(messaging, async (newToken) => {
    console.log("FCM token refreshed:", newToken);
    // Register the new token with the backend
    await registerFcmTokenWithBackend(newToken);
  });
}
```

---

## 3. Backend FCM Token Registration

The backend provides multiple ways to register your FCM token. Choose the method that best fits your flow.

### 3.1 Auto-register during Signup

Include the FCM token in your signup request to automatically register it:

```typescript
// frontend/src/auth/signup.ts
import { registerPushNotifications } from "./firebase";

async function signup(email: string, username: string, password: string) {
  // Get FCM token before signup
  const fcmToken = await registerPushNotifications();

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email,
        username,
        password,
        fcmToken, // optional but recommended
      }),
    },
  );

  return response.json();
}
```

### 3.2 Auto-register during Login

Include the FCM token in your login request:

```typescript
// frontend/src/auth/login.ts
import { registerPushNotifications } from "./firebase";

async function login(emailOrUsername: string, password: string) {
  const fcmToken = await registerPushNotifications();

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        emailOrUsername,
        password,
        fcmToken, // optional but recommended
      }),
    },
  );

  return response.json();
}
```

### 3.3 Manual Token Registration

Register the token separately if needed (e.g., after user grants permission post-login):

```typescript
async function registerFcmTokenWithBackend(token: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/notifications/fcm/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    },
  );
  return response.json();
}
```

### 3.4 Unregister Token (Logout)

Always unregister the FCM token when the user logs out:

```typescript
async function logout(fcmToken: string) {
  // First unregister the token from backend
  await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/notifications/fcm/unregister`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: fcmToken }),
    },
  );

  // Then call backend logout endpoint
  await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}
```

---

## 4. Handle Incoming Notifications

### 4.1 Foreground Notifications (App is open)

```typescript
import { onMessage } from "firebase/messaging";
import { messaging } from "./firebase";

if (messaging) {
  onMessage(messaging, (payload) => {
    console.log("Received foreground message:", payload);

    // Show in-app notification
    if (Notification.permission === "granted") {
      new Notification(payload.notification?.title || "New Notification", {
        body: payload.notification?.body,
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
      });
    }
  });
}
```

### 4.2 Background Notifications (App is closed/minimized)

Create a service worker file `public/firebase-messaging-sw.js` in your frontend:

```javascript
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js",
);

// Same Firebase config as your frontend
const firebaseApp = firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123def456",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("Received background message:", payload);

  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icon-192x192.png",
    badge: "/badge-72x72.png",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  let url = "/";

  // Navigate based on notification type (matches backend payload structure)
  if (data?.type === "new_message" && data.chatId) {
    url = `/chat/${data.chatId}`;
  } else if (data?.type === "incoming_call" || data?.type === "missed_call") {
    url = "/calls";
  }

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientsList) => {
      const existingClient = clientsList.find((client) => client.url === url);
      if (existingClient) {
        return existingClient.focus();
      } else if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
```

### 4.3 Register the Service Worker

Add this to your frontend's main entry file (e.g., `main.tsx` or `index.tsx`):

```typescript
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      console.log("ServiceWorker registration successful:", registration);
    } catch (err) {
      console.log("ServiceWorker registration failed:", err);
    }
  });
}
```

---

## 5. Backend Notification Payload Reference

All notifications sent from the backend follow this consistent structure:

### Common Notification Types

| Type            | Description               | Data Fields                                                  |
| --------------- | ------------------------- | ------------------------------------------------------------ |
| `new_message`   | New chat message received | `chatId`, `messageId`, `senderId`, `senderName`, `itemKind?` |
| `incoming_call` | Incoming WebRTC call      | `callId`, `callerId`, `media`, `callerName`                  |
| `missed_call`   | Missed call notification  | `callId`, `callerId`, `media`, `callerName`                  |

### Full Payload Structure

```typescript
interface NotificationPayload {
  notification: {
    title: string;
    body: string;
  };
  data: {
    type: "new_message" | "incoming_call" | "missed_call";
    [key: string]: string; // Type-specific additional fields
  };
}
```

---

## 6. Backend Implementation Details

### Backend Firebase Initialization

The backend initializes Firebase Admin in `src/config/firebase.ts`:

- Uses service account credentials from `serviceAccountKey.json`
- Exports `messaging` instance for sending notifications
- Provides two helper functions:
  - `sendPushNotification()`: Send to a single token
  - `sendPushNotificationsToTokens()`: Send to multiple tokens

### Backend FCM Token Storage

User's FCM tokens are stored in the `User` model:

```typescript
// User model includes fcmTokens array
fcmTokens: string[];
```

Tokens are automatically deduplicated using MongoDB's `$addToSet` operator.

### Backend Notification Triggers

The backend sends notifications in these scenarios:

1. **New message received**: When a user sends a chat message (text, image, video, audio, or file)
2. **Incoming call**: When a WebRTC call is initiated
3. **Missed call**: When a call is not answered within the timeout period (configured via `CALL_RING_TIMEOUT_SECONDS`)

---

## 7. Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure your frontend URL is added to the backend's `CORS_ORIGIN` in `.env`
2. **Notifications not received**: Verify FCM token is properly registered with the backend
3. **Token registration fails**: Check that the user is authenticated (all notification endpoints require `requireAuth` middleware)
4. **Service worker not registering**: Verify the service worker file is served from the correct path

### Debug Logs

The backend includes detailed debug logging for all FCM operations:

- Token registration/unregistration attempts
- Notification send successes/failures
- Authentication issues

Check server logs for messages prefixed with `[debug]` to diagnose integration issues.
