# Lover Link WebRTC Chat Server - Calls, Messages & Notifications Integration Guide (End-to-End)

## 1. Overview

This module integrates real-time WebRTC calling, 1:1 direct messaging, and push notifications for Lover Link, enabling seamless communication between connected users. The system handles WebRTC signaling, call lifecycle management, message persistence, and multi-channel notifications (WebSocket + Firebase Cloud Messaging).

## 2. Core Architecture & Dependencies

### Key Files (From actual codebase)

| File                           | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `src/routes/calls.ts`          | REST endpoints for call history management                   |
| `src/routes/chats.ts`          | REST endpoints for chat and message management               |
| `src/sockets/signaling.ts`     | Socket.IO handlers for WebRTC signaling and real-time chat   |
| `src/sockets/chatRealtime.ts`  | Additional real-time chat event handlers (typing, receipts)  |
| `src/sockets/chatBroadcast.ts` | Broadcast utility for sending messages to multiple users     |
| `src/sockets/store.ts`         | In-memory socket store tracking online users and connections |
| `src/models/CallLog.ts`        | MongoDB model for call history tracking                      |
| `src/models/Message.ts`        | MongoDB model for chat messages with reactions and receipts  |
| `src/models/Chat.ts`           | MongoDB model for chat conversations                         |
| `src/models/Block.ts`          | User block relationships for access control                  |
| `src/config/firebase.ts`       | Firebase Admin SDK for push notifications                    |
| `src/sockets/runtime.ts`       | Socket.IO server instance management                         |

### Core Dependencies

- Socket.IO 4.7.5: Real-time bidirectional communication
- WebRTC: Peer-to-peer media streaming (browser-native, server handles signaling only)
- Firebase Cloud Messaging: Push notifications for offline users
- Zod 3.23.8: Input validation for all socket and REST events
- MongoDB + Mongoose 8.8.3: Persistent storage for calls, messages, and chats
- nanoid 5.0.7: Unique call ID generation
- open-graph-scraper: Link preview generation for text messages

## 3. Call Management System

### 3.1 Call Status Enums

```typescript
type CallStatus =
  | "ringing" // Call initiated, waiting for answer
  | "answered" // Call active and connected
  | "ended" // Call completed normally
  | "cancelled" // Caller cancelled before answer
  | "declined" // Callee declined the call
  | "missed"; // Call timed out or user was offline
```

### 3.2 CallLog Document Model

```typescript
interface CallLogDoc {
  callId: string; // Unique nanoid(16) call identifier
  callerId: mongoose.Types.ObjectId; // User who initiated the call
  calleeId: mongoose.Types.ObjectId; // User receiving the call
  media?: "audio" | "video"; // Call media type
  status: CallStatus; // Current call state
  offeredAt: Date; // When call was initiated
  answeredAt?: Date; // When call was answered (if applicable)
  endedAt?: Date; // When call ended (if applicable)
  endedBy?: mongoose.Types.ObjectId; // User who ended the call
  reason?: string; // Optional end reason
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:

- `callId: 1` (unique)
- `callerId: 1, offeredAt: -1`
- `calleeId: 1, offeredAt: -1`
- `status: 1`

### 3.3 REST API: Get Call History

**Endpoint**: `GET /api/calls` (protected)  
**Query Parameters**:

- `limit`: Max results (default: 50, max: 100)
- `cursor`: Pagination cursor (last call ID from previous page)
- `status`: Filter by call status (optional)

**Success Response**:

```json
{
  "ok": true,
  "nextCursor": "60d21b4667d0d8992e610c85",
  "calls": [
    {
      "id": "60d21b4667d0d8992e610c86",
      "callId": "abc123xyz456",
      "callerId": "60d21b4667d0d8992e610c87",
      "calleeId": "60d21b4667d0d8992e610c88",
      "status": "ended",
      "offeredAt": "2024-01-15T10:00:00.000Z",
      "answeredAt": "2024-01-15T10:00:05.000Z",
      "endedAt": "2024-01-15T10:05:30.000Z",
      "endedBy": "60d21b4667d0d8992e610c87",
      "reason": "call_completed"
    }
  ]
}
```

---

### 3.4 REST API: Start a Call

**Endpoint**: `POST /api/calls/start` (protected)  
**Request Payload**:

```json
{
  "calleeId": "60d21b4667d0d8992e610c88",
  "media": "video" // optional, defaults to "video"
}
```

**Success Response**:

```json
{
  "ok": true,
  "callId": "abc123xyz456def7"
}
```

- Creates initial `ringing` call log in database
- Typically followed by socket.io `call:offer` to initiate WebRTC signaling

## 4. WebRTC Signaling & Real-Time Call Flow

### 4.1 Socket.IO Call Events

#### Client → Server: `call:offer`

Initiates a WebRTC call to another user.
**Zod Validation Schema** (from src/sockets/signaling.ts):

```typescript
const ObjectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/);
const RtcSessionDescription = z.object({
  type: z.string().min(1),
  sdp: z.string().optional(),
});

const CallOfferSchema = z.object({
  to: ObjectIdString,
  callId: z.string().min(1).optional(),
  media: z.enum(["audio", "video"]).optional(),
  offer: RtcSessionDescription,
});
```

**Request Payload**:

```json
{
  "to": "60d21b4667d0d8992e610c88",
  "callId": "abc123xyz456def7",
  "media": "video",
  "offer": {
    "type": "offer",
    "sdp": "v=0\r\no=-..."
  }
}
```

**Server Processing**:

1. Validates users are not blocked from each other
2. Creates/upserts `ringing` call log in database
3. Sends Firebase push notification to callee if they have FCM tokens registered
4. If callee is online, emits `call:offer` to all their connected sockets
5. If callee is offline, immediately marks call as `missed` and sends missed call push notification
6. Schedules `CALL_RING_TIMEOUT_SECONDS` timer to auto-mark as missed if unanswered

#### Server → Client: `call:offer`

Sent to callee when someone initiates a call.

```json
{
  "from": "60d21b4667d0d8992e610c87",
  "to": "60d21b4667d0d8992e610c88",
  "callId": "abc123xyz456def7",
  "media": "video",
  "offer": {
    /* WebRTC SDP offer */
  }
}
```

---

#### Client → Server: `call:answer`

Accepts an incoming call and sends WebRTC answer.
**Zod Validation Schema**:

```typescript
const CallAnswerSchema = z.object({
  to: ObjectIdString,
  callId: z.string().min(1),
  answer: RtcSessionDescription,
});
```

**Server Processing**:

1. Validates call log exists and caller/callee match
2. Updates call log to `answered` with timestamp
3. Creates `call_started` event message in DM chat
4. Emits `call:answer` to the caller
5. Ends any other ongoing call sessions for the callee (single device call support)

#### Server → Client: `call:answer`

Sent to caller when callee accepts the call.

```json
{
  "from": "60d21b4667d0d8992e610c88",
  "to": "60d21b4667d0d8992e610c87",
  "callId": "abc123xyz456def7",
  "answer": {
    /* WebRTC SDP answer */
  }
}
```

---

#### Client ↔ Server: `call:ice-candidate`

Exchanges WebRTC ICE candidates for peer connection.
**Zod Validation Schema**:

```typescript
const CallIceSchema = z.object({
  to: ObjectIdString,
  callId: z.string().min(1),
  candidate: IceCandidate,
});
```

- Server immediately relays candidate to the remote peer without processing
- Critical for WebRTC connectivity - sent as soon as generated by client

---

#### Client → Server: `call:end`

Terminates an active or pending call.
**Zod Validation Schema**:

```typescript
const CallEndSchema = z.object({
  to: ObjectIdString,
  callId: z.string().min(1),
  reason: z.string().optional(),
});
```

**Server Processing**:

1. Determines final call status based on who ended the call and if it was answered:
   - If answered: sets status to `ended`
   - If callee ends before answer: sets status to `declined`
   - If caller ends before answer: sets status to `cancelled`
2. Creates `call_ended` event message in DM chat with duration if applicable
3. Emits `call:end` to both parties
4. Clears any pending ring timeout

#### Server → Client: `call:end`

Sent to both users when a call ends.

```json
{
  "ok": true,
  "to": "60d21b4667d0d8992e610c88",
  "callId": "abc123xyz456def7",
  "reason": "user_initiated"
}
```

#### Server → Client: `call:missed`

Sent to callee when an incoming call times out.

```json
{
  "ok": true,
  "callId": "abc123xyz456def7",
  "from": "60d21b4667d0d8992e610c87",
  "at": "2024-01-15T10:05:00.000Z"
}
```

## 5. Chat & Messaging System

### 5.1 Message Types

```typescript
type MessageType = "text" | "share" | "event";
type EventKind = "call_started" | "call_ended";
```

### 5.2 Message Document Model

```typescript
interface MessageDoc {
  chatId: mongoose.Types.ObjectId;
  from: mongoose.Types.ObjectId;
  type: MessageType;
  clientMessageId?: string; // Client-side deduplication ID
  text?: string; // For text messages (1-4000 chars)
  item?: ShareItem; // For file/image/video/audio shares
  event?: EventItem; // For system events (call started/ended)
  reactions: Reaction[]; // User emojis reactions
  receipts: Receipt[]; // Delivery/read receipts
  linkPreview?: LinkPreview; // URL preview metadata
  editedAt?: Date;
  deletedAt?: Date;
  replyTo?: ReplyItem; // Reply reference message
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.3 Share Item Schema (File Attachments)

```typescript
interface ShareItem {
  kind: "file" | "image" | "video" | "audio";
  url: string; // CDN/storage URL
  originalName?: string; // Original filename
  mime?: string; // MIME type
  size?: number; // File size in bytes
  meta?: Record<string, unknown>; // Additional metadata
}
```

### 5.4 REST API: Get User's Chats

**Endpoint**: `GET /api/chats` (protected)

**Success Response**:

```json
{
  "ok": true,
  "chats": [
    {
      "id": "60d21b4667d0d8992e610c89",
      "type": "dm",
      "members": [
        {
          "id": "60d21b4667d0d8992e610c87",
          "email": "a@example.com",
          "username": "userA"
        },
        {
          "id": "60d21b4667d0d8992e610c88",
          "email": "b@example.com",
          "username": "userB"
        }
      ],
      "lastMessage": {
        "id": "60d21b4667d0d8992e610c90",
        "type": "text",
        "text": "Hello!",
        "from": "60d21b4667d0d8992e610c87",
        "createdAt": "2024-01-15T09:30:00.000Z"
      },
      "isPinned": false,
      "isMuted": false,
      "updatedAt": "2024-01-15T09:30:00.000Z",
      "createdAt": "2024-01-10T14:20:00.000Z"
    }
  ]
}
```

---

### 5.5 REST API: Create DM Chat

**Endpoint**: `POST /api/chats/dm` (protected)  
**Request Payload**:

```json
{
  "userId": "60d21b4667d0d8992e610c88"
}
```

- Only creates DM between mutual friends
- Returns existing chat if one already exists
- Returns 403 if users are blocked or not friends

---

### 5.6 REST API: Get Chat Messages

**Endpoint**: `GET /api/chats/:chatId/messages` (protected)  
**Query Parameters**:

- `limit`: Max messages (default: 50, max: 100)
- `cursor`: Message ID for pagination
- `before`: Date string for legacy pagination

**Success Response**: Paginated message list with all metadata, including reactions and receipts.

---

### 5.7 REST API: Send Message

**Endpoint**: `POST /api/chats/:chatId/messages` (protected)  
**Text Message Payload**:

```json
{
  "type": "text",
  "text": "Hello, how are you?",
  "replyTo": {
    "id": "60d21b4667d0d8992e610c90",
    "text": "Hi there!",
    "from": "60d21b4667d0d8992e610c88",
    "fromName": "userB"
  }
}
```

**Share Message Payload**:

```json
{
  "type": "share",
  "item": {
    "kind": "image",
    "url": "https://cdn.example.com/image.jpg",
    "originalName": "vacation.jpg",
    "mime": "image/jpeg",
    "size": 2048000
  }
}
```

### 5.8 Real-Time Chat Events

#### Server → Client: `chat:message`

Emitted to both chat members when a new message is sent, containing full message object.

#### Client → Server: `chat:typing`

Updates typing status in chat.
**Payload**:

```json
{
  "chatId": "60d21b4667d0d8992e610c89",
  "isTyping": true
}
```

- Server relays to other member with `chat:typing` event

## 6. Push Notification System (Firebase Cloud Messaging)

### 6.1 Core Configuration

Firebase Admin SDK initialized with service account key, provides two notification functions:

- `sendPushNotification()`: Single token notification
- `sendPushNotificationsToTokens()`: Batch notification to multiple tokens

### 6.2 WebPush Configuration

All notifications include:

```typescript
webpush: {
  headers: { Urgency: "high" },
  notification: {
    icon: "/icon-192x192.png",
    badge: "/badge-72x72.png",
    requireInteraction: true,
    silent: false
  }
}
```

- High priority ensures immediate delivery
- Requires interaction to prevent dismissal on mobile
- Proper icons for web and mobile platforms

### 6.3 Notification Types

#### Incoming Call Notification

Sent when a call offer is made to an offline user.

```typescript
{
  title: "Video Call from JohnDoe",
  body: "JohnDoe is calling you...",
  data: {
    type: "incoming_call",
    callId: "abc123xyz456",
    callerId: "60d21b4667d0d8992e610c87",
    media: "video",
    callerName: "JohnDoe"
  }
}
```

#### Missed Call Notification

Sent when a call is missed or times out.

```typescript
{
  title: "Missed Video Call from JohnDoe",
  body: "You missed a video call from JohnDoe",
  data: {
    type: "missed_call",
    callId: "abc123xyz456",
    callerId: "60d21b4667d0d8992e610c87",
    media: "video",
    callerName: "JohnDoe"
  }
}
```

### 6.4 FCM Token Management

User model stores `fcmTokens` array to support multiple devices. All push notifications are sent to every registered token for the target user, ensuring all devices receive the notification.

## 7. Call Lifecycle State Transitions

```
ringing
├─→ answered → ended (normal flow)
├─→ cancelled (caller hung up before answer)
├─→ declined (callee rejected the call)
└─→ missed (ring timeout or user offline)
```

## 8. Cross-Cutting Features

### 8.1 Block Enforcement

The `isBlockedEitherWay()` function prevents call/message initiation between blocked users, maintaining consistent access control across all communication channels.

### 8.2 Multi-Device Support

- Users can connect from multiple browsers/devices simultaneously
- All connected devices receive incoming call offers
- First device to answer ends the call on all other devices
- `emitToUserExcept()` ensures other devices receive `answered_elsewhere` reason

### 8.3 Automatic Cleanup

- Ring timers are cleared when calls are answered or ended
- Call logs are always updated with final state
- Stale activities are cleaned up by periodic background tasks

### 8.4 Deduplication

- `clientMessageId` prevents duplicate message sending on network retries
- Unique compound index on `(from, clientMessageId)`
- Call IDs guarantee unique call logs even with retries

## 9. Error Code Reference

| Error Code        | HTTP Status | Description                             |
| ----------------- | ----------- | --------------------------------------- |
| `InvalidChatId`   | 400         | Malformed chat ID format                |
| `NotFound`        | 404         | Chat or user not found                  |
| `InvalidTarget`   | 400         | Cannot create chat with yourself        |
| `Blocked`         | 403         | Users are blocked from interacting      |
| `NotFriends`      | 403         | Can only create DMs with mutual friends |
| `MissingCalleeId` | 400         | Call initiation missing target user     |

## 10. Environment Configuration (from src/config/env.ts)

Required environment variables for this module:

- `CALL_RING_TIMEOUT_SECONDS`: How long to ring before marking as missed (default: 30 seconds)
- Firebase service account credentials for push notifications (required for FCM)
- Additional WebRTC configuration:
  - `STUN_URLS`: STUN server URLs (default: "stun:stun.l.google.com:19302")
  - `TURN_URLS`: Optional TURN server URLs for NAT traversal
  - `TURN_USERNAME`: TURN server authentication username
  - `TURN_CREDENTIAL`: TURN server authentication credential

## 11. Integration Notes

- All call and chat endpoints require authentication via `requireAuth` middleware
- Socket.IO connections must pass valid JWT to receive real-time events
- Call event messages (`call_started`, `call_ended`) are automatically created in the DM chat, maintaining conversation history
- All database operations use atomic updates to prevent race conditions
- Block status is checked before any call or message can be initiated
- Push notifications are only sent if the target user isn't online via WebSocket
