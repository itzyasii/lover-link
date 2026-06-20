# Frontend Integration Guide

Comprehensive documentation for integrating with the WebRTC Chat Server. This guide covers all REST API endpoints and WebSocket events for realtime chat, audio/video calls, and user management.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication Flow](#authentication-flow)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Connection](#websocket-connection)
5. [WebRTC Call Events](#webrtc-call-events)
6. [Realtime Chat Events](#realtime-chat-events)
7. [Presence & Online Status](#presence--online-status)
8. [Push Notifications (Firebase)](#push-notifications-firebase)
9. [Environment Configuration](#environment-configuration)

---

## Getting Started

### Base URL

All REST API endpoints are prefixed with `/api/`

```
https://api.loverlinkliveserver.dpdns.org/api/
```

### Socket.IO Server

WebSocket connection to the production server:

```typescript
import { io } from "socket.io-client";

// Production environment variables (Next.js)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

const socket = io(SOCKET_URL, {
  auth: { accessToken: "YOUR_JWT_ACCESS_TOKEN" },
  withCredentials: true, // Required for refresh cookie to be sent
});
```

---

## Authentication Flow

### Token Lifecycle

- **Access Token**: Valid for 1 day (1440 minutes) - sent in Authorization header
- **Refresh Token**: Valid for 30 days - stored in HTTP-only cookie, automatically sent by browser

---

## REST API Endpoints

### 🔐 Authentication Endpoints (`/api/auth/*`)

#### 1. Register - `POST /api/auth/signup`

Create a new user account

```typescript
// Request Body
{
  email: string;      // valid email format
  username: string;   // 3-32 characters
  password: string;   // 8-200 characters
}

// Response (201 Created)
{
  ok: true,
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
  }
}
// Also sets HTTP-only refresh token cookie
```

#### 2. Login - `POST /api/auth/login`

Authenticate existing user

```typescript
// Request Body
{
  emailOrUsername: string;
  password: string;
}

// Response
{
  ok: true,
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
  }
}
// Also sets HTTP-only refresh token cookie
```

#### 3. Refresh Access Token - `POST /api/auth/refresh`

Get new access token (refresh token automatically sent from cookies)

```typescript
// Request Body (optional - can use cookie instead)
{
  refreshToken?: string;
}

// Response
{
  ok: true,
  accessToken: string;
}
// Rotates refresh token - sets new cookie
```

#### 4. Logout - `POST /api/auth/logout`

Invalidate refresh token and clear cookie

```typescript
// No body required
// Response
{
  ok: true;
}
```

#### 5. Get Current User - `GET /api/auth/me`

Get authenticated user's profile (requires Bearer token)

```typescript
// Headers: Authorization: Bearer {accessToken}
// Response
{
  ok: true,
  user: {
    id: string;
    email: string;
    username: string;
  }
}
```

#### 6. Google OAuth URL - `GET /api/auth/oauth/google/url`

Get Google OAuth authorization URL

```typescript
// Response
{
  ok: true,
  url: string;
  state: string;
}
```

#### 7. Google OAuth Callback - `POST /api/auth/oauth/google/callback`

Exchange code for tokens after Google OAuth

```typescript
// Request Body
{
  code: string;
}

// Response
{
  ok: true,
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
  }
}
```

---

### 👥 User Management Endpoints (`/api/users/*`)

All require `Authorization: Bearer {accessToken}` header

#### 1. Search Users - `GET /api/users/search?q={query}`

Search for users by username

```typescript
// Response
{
  ok: true,
  users: Array<{
    id: string;
    username: string;
    avatarUrl?: string;
    lastSeenAt?: string;
  }>;
}
```

#### 2. Send Friend Request - `POST /api/users/friends/request`

```typescript
// Request Body
{
  toUserId: string; // MongoDB ObjectId
}

// Response
{
  ok: true;
}
```

#### 3. Accept Friend Request - `POST /api/users/friends/accept`

```typescript
// Request Body
{
  fromUserId: string;
}
```

#### 4. Reject Friend Request - `POST /api/users/friends/reject`

```typescript
// Request Body
{
  fromUserId: string;
}
```

#### 5. Cancel Friend Request - `POST /api/users/friends/cancel`

```typescript
// Request Body
{
  toUserId: string;
}
```

#### 6. Unfriend User - `POST /api/users/friends/unfriend`

```typescript
// Request Body
{
  userId: string;
}
```

#### 7. Get Friends List - `GET /api/users/friends`

```typescript
// Response
{
  ok: true,
  friends: Array<{
    id: string;
    username: string;
    avatarUrl?: string;
    online: boolean;
  }>;
}
```

#### 8. Get Friend Requests - `GET /api/users/friends/requests`

```typescript
// Response
{
  ok: true,
  sent: Array<User>;
  received: Array<User>;
}
```

#### 9. Block User - `POST /api/users/block`

```typescript
// Request Body
{
  userId: string;
  reason?: string;
}
```

#### 10. Unblock User - `POST /api/users/unblock`

```typescript
// Request Body
{
  userId: string;
}
```

---

### 💬 Chat Endpoints (`/api/chats/*`)

All require Bearer authentication

#### 1. Get Chat List - `GET /api/chats`

```typescript
// Response
{
  ok: true,
  chats: Array<{
    id: string;
    type: "dm" | "group";
    members: string[];
    lastMessage?: Message;
    unreadCount: number;
    updatedAt: string;
  }>;
}
```

#### 2. Get Chat Messages - `GET /api/chats/{chatId}/messages?limit=50&before={messageId}`

```typescript
// Response
{
  ok: true,
  messages: Message[];
  hasMore: boolean;
}
```

#### 3. Upload File - `POST /api/uploads`

Multipart form data for file uploads (max 50MB)

```typescript
// Response
{
  ok: true,
  url: string;
  originalName: string;
  size: number;
  mime: string;
}
```

---

### 📞 Call Endpoints (`/api/calls/*`)

#### 1. Get Call History - `GET /api/calls/history?limit=20`

```typescript
// Response
{
  ok: true,
  calls: Array<{
    id: string;
    callId: string;
    callerId: string;
    calleeId: string;
    media: "audio" | "video";
    status: "ringing" | "answered" | "ended" | "missed" | "declined" | "cancelled";
    offeredAt: string;
    answeredAt?: string;
    endedAt?: string;
    duration?: number; // seconds
  }>;
}
```

---

## WebSocket Connection

### Connect with Authentication

```typescript
import { io, Socket } from "socket.io-client";

let socket: Socket;

function connectSocket(accessToken: string) {
  socket = io("http://localhost:4000", {
    auth: {
      accessToken: accessToken,
    },
    withCredentials: true,
  });

  // Connection events
  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
  });

  return socket;
}
```

### Connection Notes

- Socket automatically verifies JWT access token during handshake
- If token is invalid, connection is rejected with "invalid access token"
- Fallback: Can connect with `{ userId: "USER_ID" }` for development only

---

## WebRTC Call Events

### 📤 Client → Server Events (You send these)

#### 1. Initiate Call - `call:offer`

Start an audio or video call with another user

```typescript
socket.emit(
  "call:offer",
  {
    to: "recipient_user_id",
    callId: "optional_custom_call_id", // server generates if not provided
    media: "audio" | "video", // default: "video"
    offer: RTCSessionDescriptionInit, // WebRTC offer from your RTCPeerConnection
  },
  (response) => {
    // Acknowledgement from server
    if (response.ok) {
      console.log("Call offer sent, callId:", response.callId);
    } else {
      console.error("Failed to send call offer");
    }
  },
);
```

#### 2. Answer Call - `call:answer`

Accept an incoming call and send WebRTC answer

```typescript
socket.emit(
  "call:answer",
  {
    to: "caller_user_id",
    callId: "call_id_from_incoming_offer",
    answer: RTCSessionDescriptionInit, // WebRTC answer
  },
  (response) => {
    if (response.ok) {
      console.log("Call answered");
    }
  },
);
```

#### 3. Send ICE Candidate - `call:ice-candidate`

Forward WebRTC ICE candidates to the peer

```typescript
socket.emit(
  "call:ice-candidate",
  {
    to: "peer_user_id",
    callId: "current_call_id",
    candidate: RTCIceCandidate, // ICE candidate from RTCPeerConnection
  },
  (response) => {
    // Acknowledgement
  },
);
```

#### 4. End Call - `call:end`

Terminate an active or ringing call

```typescript
socket.emit(
  "call:end",
  {
    to: "peer_user_id",
    callId: "call_id_to_end",
    reason: "user_ended" | "declined" | "missed", // optional
  },
  (response) => {
    if (response.ok) {
      console.log("Call ended");
    }
  },
);
```

---

### 📥 Server → Client Events (You listen to these)

#### 1. Incoming Call - `call:offer`

Receive a call from another user

```typescript
socket.on("call:offer", (data) => {
  // data:
  {
    from: "caller_user_id",
    to: "your_user_id",
    callId: "unique_call_id",
    media: "audio" | "video",
    offer: RTCSessionDescriptionInit
  }

  // Show incoming call UI to user
  // If user accepts: create RTCPeerConnection, setRemoteDescription, generate answer, then emit call:answer
  // If user declines: emit call:end with reason "declined"
});
```

#### 2. Call Answered - `call:answer`

The callee accepted your call

```typescript
socket.on("call:answer", (data) => {
  // data:
  {
    from: "callee_user_id",
    to: "your_user_id",
    callId: "call_id",
    answer: RTCSessionDescriptionInit
  }

  // Set remote description on your RTCPeerConnection
  peerConnection.setRemoteDescription(data.answer);
});
```

#### 3. Receive ICE Candidate - `call:ice-candidate`

Receive ICE candidate from peer

```typescript
socket.on("call:ice-candidate", (data) => {
  // data:
  {
    from: "peer_user_id",
    to: "your_user_id",
    callId: "call_id",
    candidate: RTCIceCandidate
  }

  // Add candidate to your RTCPeerConnection
  peerConnection.addIceCandidate(data.candidate);
});
```

#### 4. Call Ended - `call:end`

Call was terminated by either party or timeout

```typescript
socket.on("call:end", (data) => {
  // data:
  {
    ok: true,
    to: "your_user_id",
    from: "peer_user_id",
    callId: "call_id",
    reason: "timeout" | "user_offline" | "declined" | "cancelled" | "user_ended"
  }

  // Clean up your RTCPeerConnection
  // Update UI to show call ended
  peerConnection?.close();
});
```

#### 5. Missed Call - `call:missed`

You missed an incoming call (ringing timeout)

```typescript
socket.on("call:missed", (data) => {
  // data:
  {
    ok: true,
    callId: "call_id",
    from: "caller_user_id",
    at: "2024-01-01T12:00:00.000Z"
  }

  // Show missed call notification
});
```

---

### Call Timeout Configuration

- Default ring timeout: 30 seconds (configurable via `CALL_RING_TIMEOUT_SECONDS` env)
- If callee doesn't answer within timeout, server emits `call:missed` to callee and `call:end` to both parties
- If callee is offline, server immediately marks call as missed

---

## Realtime Chat Events

### 📤 Client → Server Events

#### 1. Send Typing Indicator - `chat:typing`

```typescript
socket.emit(
  "chat:typing",
  {
    chatId: "chat_room_id",
    isTyping: boolean,
  },
  (response) => {
    // Acknowledgement
  },
);
```

#### 2. Mark Messages as Delivered - `chat:delivered`

```typescript
socket.emit(
  "chat:delivered",
  {
    messageIds: ["msg_id_1", "msg_id_2"],
  },
  (response) => {
    if (response.ok) console.log("Delivery receipts sent");
  },
);
```

#### 3. Mark Messages as Read - `chat:read`

```typescript
socket.emit(
  "chat:read",
  {
    messageIds: ["msg_id_1", "msg_id_2"],
  },
  (response) => {
    if (response.ok) console.log("Read receipts sent");
  },
);
```

#### 4. Mark Voice Message as Listened - `chat:voice:listened`

```typescript
socket.emit(
  "chat:voice:listened",
  {
    messageId: "voice_message_id",
  },
  (response) => {
    if (response.ok) console.log("Voice marked as listened");
  },
);
```

#### 5. Send Chat Message - `chat:message`

_(Actually sent via REST, but can be emitted via socket for optimistic updates)_

```typescript
// Better to POST to REST API, socket receives the broadcast
socket.emit("chat:message", {
  to: "recipient_id",
  clientMessageId: "client_generated_id",
  text: "Hello world!",
});
```

#### 6. Share Media/File - `share:item`

```typescript
socket.emit("share:item", {
  to: "recipient_id",
  clientMessageId: "client_id",
  item: {
    kind: "file" | "image" | "video" | "audio",
    url: "https://...",
    originalName: "file.pdf",
    mime: "application/pdf",
    size: 1024000,
  },
});
```

---

### 📥 Server → Client Chat Events

#### 1. Receive Typing Indicator - `chat:typing`

```typescript
socket.on("chat:typing", (data) => {
  // data:
  {
    ok: true,
    chatId: "chat_id",
    from: "other_user_id",
    isTyping: boolean
  }

  // Update UI to show "user is typing..."
});
```

#### 2. Receive Message - `chat:message`

```typescript
socket.on("chat:message", (data) => {
  // data:
  {
    ok: true,
    chatId: "chat_id",
    message: {
      id: "msg_id",
      chatId: "chat_id",
      from: "sender_id",
      type: "text" | "image" | "file" | "event",
      text?: string;
      item?: {
        kind: "file" | "image" | "video" | "audio",
        url: string,
        originalName?: string
      };
      event?: {
        kind: "call_started" | "call_ended",
        callId?: string,
        media?: "audio" | "video"
      };
      createdAt: string;
      editedAt?: string;
      deletedAt?: string;
      receipts: Array<{
        userId: string;
        deliveredAt?: string;
        readAt?: string;
      }>;
    }
  }

  // Add message to your chat UI
});
```

#### 3. Receive Delivery/Read Receipts - `chat:receipt`

```typescript
socket.on("chat:receipt", (data) => {
  // data:
  {
    ok: true,
    type: "delivered" | "read",
    messageIds: string[],
    userId: "user_who_read",
    chatId: "chat_id",
    at: "2024-01-01T12:00:00.000Z"
  }

  // Update message status in UI
});
```

#### 4. Message Edited - `chat:message:edited`

```typescript
socket.on("chat:message:edited", (data) => {
  // data:
  {
    chatId: "chat_id",
    message: UpdatedMessage
  }

  // Update message in your UI
});
```

---

## Presence & Online Status Events

### 📤 Client → Server

```typescript
// Get list of online users
socket.emit("presence:list", (response) => {
  if (response.ok) {
    console.log("Online users:", response.users);
  }
});

// Ping to update lastSeenAt
socket.emit("presence:ping");
```

### 📥 Server → Client

```typescript
// Initial list of online users on connect
socket.on("presence:online", (data) => {
  // data:
  {
    ok: true,
    users: string[]; // array of user IDs currently online
  }
});

// Someone came online or went offline
socket.on("presence:update", (data) => {
  // data:
  {
    ok: true,
    users: string[]; // updated list of online users
  }

  // Update your online status UI
});

// Your own presence info
socket.on("presence:me", (data) => {
  // data:
  {
    ok: true,
    userId: "your_user_id"
  }
});
```

---

## Environment Configuration (Frontend - Next.js)

### Required Environment Variables

Create a `.env.local` file in your Next.js project with these production values:

```env
# LoverLink Production Server
NEXT_PUBLIC_API_BASE_URL=https://api.loverlinkliveserver.dpdns.org
NEXT_PUBLIC_SOCKET_URL=https://api.loverlinkliveserver.dpdns.org

# WebRTC ICE Servers (built into server, can also configure client-side)
NEXT_PUBLIC_STUN_URL=stun:stun.l.google.com:19302
```

### Usage in Next.js

```typescript
// app/lib/socket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function initializeSocket(accessToken: string) {
  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

  if (!SOCKET_URL) throw new Error("SOCKET_URL not configured");

  socket = io(SOCKET_URL, {
    auth: { accessToken },
    withCredentials: true, // Critical: sends refresh cookie with all socket requests
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

### WebRTC Configuration for Frontend

```typescript
const peerConnectionConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Add TURN server if needed for production
  ],
};

const peerConnection = new RTCPeerConnection(peerConnectionConfig);
```

---

## WebRTC Call Flow Summary

1. **Initiator (Caller)**:
   - Creates `RTCPeerConnection`
   - Creates offer with `createOffer()`
   - Sets local description
   - Emits `call:offer` with the SDP offer
   - Listens for `onicecandidate` to send ICE candidates via `call:ice-candidate`

2. **Receiver (Callee)**:
   - Receives `call:offer` event
   - Creates `RTCPeerConnection`
   - Sets remote description with caller's offer
   - Creates answer with `createAnswer()`
   - Sets local description
   - Emits `call:answer` with SDP answer
   - Listens for `onicecandidate` to send ICE candidates

3. **Both Peers**:
   - Add received ICE candidates to their connections
   - When `onconnectionstatechange` fires to "connected", call is active
   - Call ends when either emits `call:end` or timeout occurs

---

## Security Best Practices for Frontend

1. **Store access token in memory only** - never localStorage/sessionStorage
2. **Refresh token is HTTP-only** - automatically handled by browser, inaccessible to JS
3. **Always use HTTPS in production** - set `COOKIE_SECURE=true` on server
4. **Implement token refresh before expiry** - refresh access token 5-10 minutes before it expires
5. **Clear tokens on logout** - invalidate refresh token and clear access token from memory
6. **Handle socket disconnections gracefully** - implement reconnection logic with fresh access token

---

## Error Handling

All API endpoints return consistent error format:

```typescript
{
  ok: false,
  error: "ErrorCode",
  details?: Record<string, any> // additional error context
}
```

Common error codes:

- `Unauthorized` - missing/invalid authentication
- `InvalidCredentials` - wrong email/password
- `UserAlreadyExists` - signup with existing email/username
- `NotFound` - resource doesn't exist
- `Forbidden` - not allowed to perform action
- `FileTooLarge` - upload exceeds size limit
- `DuplicateKey` - unique constraint violation

---

## TypeScript Interfaces (for Frontend)

```typescript
interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  lastSeenAt?: string;
}

interface Message {
  id: string;
  chatId: string;
  from: string;
  type: "text" | "image" | "video" | "file" | "audio" | "event";
  text?: string;
  item?: SharedItem;
  event?: MessageEvent;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  receipts: MessageReceipt[];
}

interface SharedItem {
  kind: "file" | "image" | "video" | "audio";
  url: string;
  originalName?: string;
  mime?: string;
  size?: number;
}

interface MessageEvent {
  kind: "call_started" | "call_ended";
  callId?: string;
  media?: "audio" | "video";
  by?: string;
}

interface MessageReceipt {
  userId: string;
  deliveredAt?: string;
  readAt?: string;
}

interface CallLog {
  id: string;
  callId: string;
  callerId: string;
  calleeId: string;
  media: "audio" | "video";
  status:
    | "ringing"
    | "answered"
    | "ended"
    | "missed"
    | "declined"
    | "cancelled";
  offeredAt: string;
  answeredAt?: string;
  endedAt?: string;
  duration?: number;
}
```

---

## 🚀 Production Deployment Checklist (LoverLink)

### Server Environment Variables to Set

On your production server, update the `.env` file with these production values:

```env
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://loverlinkliveserver.dpdns.org  # Your frontend domain
MONGODB_URI=your_production_mongodb_uri

# Strong, unique secrets for production (never use dev values!)
JWT_ACCESS_SECRET=generate_a_strong_random_secret_here_32+chars
JWT_REFRESH_SECRET=generate_another_strong_random_secret_here_32+chars

# Cookie security (critical for production HTTPS)
COOKIE_SECURE=true
COOKIE_DOMAIN=loverlinkliveserver.dpdns.org
REFRESH_COOKIE_NAME=rt

# Token durations (already configured: 1 day access, 30 days refresh)
ACCESS_TOKEN_TTL_MINUTES=1440
REFRESH_TOKEN_TTL_DAYS=30
```

### Frontend Environment Setup

In your Next.js frontend `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.loverlinkliveserver.dpdns.org
NEXT_PUBLIC_SOCKET_URL=https://api.loverlinkliveserver.dpdns.org
```

---

## Push Notifications (Firebase)

The server supports Firebase Cloud Messaging (FCM) push notifications for web browsers. This allows users to receive notifications for new messages and incoming calls even when the app is in the background or closed.

### Register FCM Token

The server supports automatic FCM token registration during **login** and **signup**, or you can manually register the token.

#### 1. Auto-register during Login

Include the FCM token in your login request to automatically register it:

```typescript
// POST /api/auth/login
await fetch(`${API_BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    emailOrUsername: "user@example.com",
    password: "password123",
    fcmToken: "YOUR_FCM_TOKEN_FROM_FIREBASE", // optional but recommended
  }),
});
```

#### 2. Auto-register during Signup

Include the FCM token in your signup request to register it when the account is created:

```typescript
// POST /api/auth/signup
await fetch(`${API_BASE}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    email: "user@example.com",
    username: "username",
    password: "password123",
    fcmToken: "YOUR_FCM_TOKEN_FROM_FIREBASE", // optional but recommended
  }),
});
```

#### 3. Manual registration (if needed)

If you need to register the token separately (e.g., after user grants permission post-login):

```typescript
// POST /api/notifications/fcm/register
await fetch(`${API_BASE}/api/notifications/fcm/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ token: "YOUR_FCM_TOKEN_FROM_FIREBASE" }),
});
```

### Unregister FCM Token

Always unregister the token when the user logs out or disables notifications:

```typescript
// POST /api/notifications/fcm/unregister
await fetch(`${API_BASE}/api/notifications/fcm/unregister`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ token: "YOUR_FCM_TOKEN" }),
});
```

### Frontend Firebase Setup

First, install Firebase in your frontend project:

```bash
npm install firebase
# or
yarn add firebase
```

Initialize Firebase and set up FCM in your frontend:

```typescript
// firebase.ts (frontend)
import { initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";

// Your Firebase project config (from Firebase Console)
const frontendFirebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123def456",
};

const firebaseApp = initializeApp(frontendFirebaseConfig);
export const messaging = isSupported() ? getMessaging(firebaseApp) : null;

// VAPID public key (from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates)
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";

// Request notification permission and get FCM token
export async function registerPushNotifications() {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY });
      console.log("FCM Token:", token);
      return token;
    } else {
      console.warn("Notification permission denied");
      return null;
    }
  } catch (error) {
    console.error("Failed to register push notifications:", error);
    return null;
  }
}

// Handle foreground messages (when app is open)
if (messaging) {
  onMessage(messaging, (payload) => {
    console.log("Received foreground message:", payload);
    // You can show an in-app notification here
    if (Notification.permission === "granted") {
      new Notification(payload.notification?.title || "New Notification", {
        body: payload.notification?.body,
        icon: "/icon-192x192.png",
      });
    }
  });
}
```

### Complete Login Flow with FCM

````typescript
// auth.ts (frontend)
import { registerPushNotifications, messaging } from "./firebase";

async function login(email: string, password: string) {
  // Get FCM token first
  const fcmToken = await registerPushNotifications();

  // Send login request with token
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ emailOrUsername: email, password, fcmToken })
  });

  return response.json();
}

// Logout with token unregistration
async function logout(fcmToken: string) {
  // Unregister FCM token before logging out
  await fetch(`${API_BASE}/api/notifications/fcm/unregister`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token: fcmToken })
  });

  // Then call server logout endpoint
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include"
  });
}

### Service Worker Setup (Required for Background Notifications)

Create a service worker file in your frontend's public directory to handle background notifications:

```typescript
// public/firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

// Same Firebase config as your frontend
const firebaseApp = firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123def456"
});

const messaging = firebase.messaging();

// Handle background messages (when app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log("Received background message:", payload);

  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/icon-192x192.png",
    badge: "/badge-72x72.png",
    data: payload.data // Pass along the notification data for click handling
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = "/"; // Default to home page

  // Navigate to appropriate screen based on notification type
  if (data?.type === "new_message" && data.chatId) {
    url = `/chat/${data.chatId}`; // Navigate to chat screen
  } else if (data?.type === "incoming_call" || data?.type === "missed_call") {
    url = `/calls`; // Navigate to calls screen
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientsList) => {
      const existingClient = clientsList.find((client) => {
        return client.url === url && "focus" in client;
      });

      if (existingClient) {
        return existingClient.focus();
      } else if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

### Register the Service Worker
Register the service worker in your frontend's main entry file:
```typescript
// main.tsx or index.tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      console.log('ServiceWorker registration successful:', registration);
    } catch (err) {
      console.log('ServiceWorker registration failed:', err);
    }
  });
}
```

### Handle Token Refresh
FCM tokens can expire or change. Add token refresh logic to ensure your user always receives notifications:
```typescript
// Monitor for token refresh
import { onTokenRefresh } from "firebase/messaging";

if (messaging) {
  onTokenRefresh(messaging, async (newToken) => {
    console.log("FCM token refreshed:", newToken);
    // Register the new token with the server
    await fetch(`${API_BASE}/api/notifications/fcm/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token: newToken })
    });
  });
}
```

### Notification Payload Reference
All notifications from the server include this structure:
```typescript
// Common payload structure for all notification types
interface NotificationPayload {
  notification: {
    title: string;
    body: string;
  };
  data: {
    type: "new_message" | "incoming_call" | "missed_call";
    [key: string]: string; // Additional type-specific data
  };
}

// new_message data fields
type NewMessageData = {
  type: "new_message";
  chatId: string;
  messageId: string;
  senderId: string;
  senderName: string;
};

// incoming_call data fields
type IncomingCallData = {
  type: "incoming_call";
  callId: string;
  callerId: string;
  media: "audio" | "video";
  callerName: string;
};

// missed_call data fields
type MissedCallData = {
  type: "missed_call";
  callId: string;
  callerId: string;
  media: "audio" | "video";
  callerName: string;
};
````

### Notification Types

The server sends these push notification types:

1. **New Message** (`type: "new_message"`)
   - Triggered when a user receives a new chat message
   - Contains sender information and message preview

2. **Incoming Call** (`type: "incoming_call"`)
   - Triggered when someone starts a video/audio call
   - Includes call ID, caller info, and media type

3. **Missed Call** (`type: "missed_call"`)
   - Triggered when a call is missed or the recipient is offline
   - Includes call details and caller information

---

## Troubleshooting Production Issues

### Common Issues

1. **CORS Errors in Production**
   - Verify server's `CORS_ORIGIN` exactly matches your frontend domain
   - Always include `withCredentials: true` in all fetch/axios calls

   ```typescript
   // Example axios setup
   const api = axios.create({
     baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
     withCredentials: true, // sends refresh cookie with every request
   });
   ```

2. **WebRTC Connection Fails**
   - Verify STUN server is accessible: `stun:stun.l.google.com:19302`
   - For strict networks, consider adding a TURN server to your production env
   - Ensure browser camera/microphone permissions are granted (only works on HTTPS)

3. **Refresh Cookie Not Being Sent (Production)**
   - `COOKIE_SECURE=true` is set on server (required for HTTPS)
   - `COOKIE_DOMAIN` matches your domain exactly
   - Frontend and API are on the same root domain (api.xxx and frontend.xxx)
   - `sameSite: "lax"` is correctly set in server's cookie options

4. **Socket Authentication Failed**
   - Check access token hasn't expired (1 day = 1440 minutes)
   - Implement auto-refresh: refresh token 5 minutes before expiry
   - Add socket reconnection logic that fetches a new access token

5. **Cookie Blocked by Browser**
   - Third-party cookie blocking can affect if domains don't match perfectly
   - Your setup (same domain for API and frontend) avoids this issue

For additional support, check server logs for detailed error messages. The server outputs structured logs that include socket connection attempts, authentication failures, and WebRTC signaling events.
