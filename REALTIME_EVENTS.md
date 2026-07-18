# Lover Link WebRTC Server - Complete Real-Time Socket.IO Events Reference

_Last updated: 2026-07-18 | Generated from actual codebase implementation_

---

## Table of Contents

1. [Connection & Lifecycle Events](#connection--lifecycle-events)
2. [Presence & Online Status Events](#presence--online-status-events)
3. [Chat Activity Events](#chat-activity-events)
4. [Chat Messaging Events](#chat-messaging-events)
5. [Message Receipt & Status Events](#message-receipt--status-events)
6. [Message Reaction Events](#message-reaction-events)
7. [Voice Message Specific Events](#voice-message-specific-events)
8. [WebRTC Call Signaling Events](#webrtc-call-signaling-events)
9. [All Events Alphabetical Index](#all-events-alphabetical-index)
10. [Implementation Notes](#implementation-notes)

---

## Connection & Lifecycle Events

### `connection` (Server-side only)

**File**: [`src/sockets/index.ts`](src/sockets/index.ts)  
**Direction**: Internal server event  
**Description**: Triggered when a new Socket.IO connection is established. Authentication is verified during the handshake middleware before this event fires. The server adds the socket to the user's active connections and broadcasts presence updates to all users.

### `disconnect` (Server-side only)

**File**: [`src/sockets/index.ts`](src/sockets/index.ts)  
**Direction**: Internal server event  
**Description**: Triggered when a client's socket connection terminates. Removes the socket from the user's active connections, updates their `lastSeenAt` timestamp, and broadcasts presence update to all remaining users.

---

## Presence & Online Status Events

### `presence:list` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**: No payload required  
**Acknowledgement**: `{ ok: true, users: string[] }`  
**Description**: Client requests a list of all currently online users. Returns an array of user IDs of all connected users in the system.

### `presence:me` (Server → Client)

**File**: [`src/sockets/index.ts`](src/sockets/index.ts)  
**Payload**: `{ ok: true, userId: string }`  
**Description**: Sent to the newly connected client immediately after connection to confirm their identity and successful authentication.

### `presence:online` (Server → Client)

**File**: [`src/sockets/index.ts`](src/sockets/index.ts)  
**Payload**: `{ ok: true, users: string[] }`  
**Description**: Sent to the newly connected client with the complete list of all online users at the time of connection.

### `presence:ping` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**: No payload required  
**Description**: Client sends a keep-alive ping to update their `lastSeenAt` timestamp in the database, maintaining their online presence status.

### `presence:update` (Server → All clients)

**File**: [`src/sockets/index.ts`](src/sockets/index.ts)  
**Payload**: `{ ok: true, users: string[] }`  
**Description**: Broadcast to all connected users whenever the online user list changes (a user connects or disconnects). Contains the updated list of all online user IDs.

---

## Chat Activity Events

### `chat:enter` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  chatId: string; // MongoDB ObjectId (24-char hex)
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client notifies the server they have entered a specific chat. Marks the user as "active" in that chat for 30 seconds, preventing push notifications for new messages in that chat while the user is actively viewing it.

### `chat:leave` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  chatId: string; // MongoDB ObjectId (24-char hex)
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client notifies the server they have left a specific chat. Removes the user's active status from that chat, re-enabling push notifications for new messages.

### `chat:ping` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  chatId: string; // MongoDB ObjectId (24-char hex)
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client sends a keep-alive to maintain active status in a chat. Resets the 30-second inactivity timer, extending the period before push notifications are re-enabled.

### `chat:typing` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  chatId: string; // MongoDB ObjectId
  isTyping: boolean;
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client sends typing indicator status to the server. The server validates the user is a member of the chat, then forwards the typing status to the other chat participant.

### `chat:typing` (Server → Client)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Payload**:

```typescript
{
  ok: true;
  chatId: string;
  from: string; // User ID of the person typing
  isTyping: boolean;
}
```

**Description**: Sent to the other chat participant when someone starts or stops typing.

---

## Chat Messaging Events

### `chat:message` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Recipient user ID (MongoDB ObjectId)
  clientMessageId?: string; // Optional client-side UUID for deduplication
  text: string; // Message content (1-4000 characters)
}
```

**Acknowledgement**: `{ ok: boolean, chatId?: string, messageId?: string }`  
**Description**: Client sends a text message to another user. The server:

1. Validates both users are friends and not blocked
2. Creates or retrieves the DM chat between the users
3. Persists the message to MongoDB
4. Broadcasts the message to both participants
5. Scrapes OpenGraph link previews if URLs are detected in the text
6. Sends a push notification to the recipient **only if they are not actively viewing the chat**

### `chat:message` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: Complete message object with all metadata:

```typescript
{
  ok: true;
  chatId: string;
  message: {
    id: string;
    chatId: string;
    from: string;
    type: "text" | "event";
    clientMessageId: string | null;
    text: string | null;
    item: any;
    event?: any;
    receipts: any[];
    reactions: any[];
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    linkPreview?: any;
  };
}
```

**Description**: Broadcast to both sender and recipient when a new text message is created. Also used for system event messages (call started, call ended).

### `share:item` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Recipient user ID
  clientMessageId?: string; // Optional deduplication ID
  item: {
    kind: "file" | "image" | "video" | "audio";
    url: string;
    originalName?: string;
    mime?: string;
    size?: number;
    meta?: Record<string, unknown>;
  };
}
```

**Acknowledgement**: `{ ok: boolean, chatId?: string, messageId?: string }`  
**Description**: Client sends a media/file share to another user. Similar to `chat:message` but for non-text content. Creates a share-type message in the database, broadcasts to both users, and sends a push notification if the recipient is not active in the chat.

### `share:item` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: Complete message object with shared item metadata  
**Description**: Broadcast to both sender and recipient when a new media/file share message is created.

---

## Message Receipt & Status Events

### `chat:delivered` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  messageIds: string[]; // Array of message IDs (1-200 max)
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client acknowledges receipt of messages. The server updates the `deliveredAt` timestamp on all specified messages in the database and notifies the original sender that their messages were delivered.

### `chat:read` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  messageIds: string[]; // Array of message IDs (1-200 max)
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Client acknowledges that messages have been read. Similar to `chat:delivered` but sets both `deliveredAt` and `readAt` timestamps.

### `chat:receipt` (Server → Client)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Payload**:

```typescript
{
  ok: true;
  type: "delivered" | "read";
  messageIds: string[];
  userId: string; // User who acknowledged the messages
  chatId: string;
  at: string; // ISO timestamp
}
```

**Description**: Sent to the message sender to notify them when their messages have been delivered or read by the recipient.

---

## Message Reaction Events

### `chat:react` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  messageId: string; // Message to react to
  emoji: string; // Emoji string (supports multi-codepoint sequences)
}
```

**Acknowledgement**:

```typescript
{
  ok: boolean;
  action?: "added" | "removed";
  user?: { id: string; username?: string; email?: string };
  error?: string;
}
```

**Description**: Client adds or removes an emoji reaction to a message. This toggles the reaction: if the user already reacted with that emoji, it's removed; otherwise it's added. The server broadcasts the reaction update to both chat participants.

### `chat:reaction` (Server → Client)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Payload**:

```typescript
{
  ok: true;
  chatId: string;
  messageId: string;
  emoji: string;
  userId: string;
  user: { id: string; username?: string; email?: string };
  action: "added" | "removed";
  at: string; // ISO timestamp
}
```

**Description**: Broadcast to all chat members when a reaction is added or removed from a message.

---

## Voice Message Specific Events

### `chat:voice:listened` (Client → Server)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Schema**:

```typescript
{
  messageId: string; // Voice message that was listened to
}
```

**Acknowledgement**: `{ ok: boolean, error?: string }`  
**Description**: Client notifies the server that a voice/audio message has been listened to. Only valid for audio-type share messages. Updates the receipt with a `listenedAt` timestamp and notifies the sender.

### `chat:voice:listened` (Server → Client)

**File**: [`src/sockets/chatRealtime.ts`](src/sockets/chatRealtime.ts)  
**Payload**:

```typescript
{
  ok: true;
  chatId: string;
  messageId: string;
  userId: string; // User who listened to the message
  at: string; // ISO timestamp
}
```

**Description**: Sent to the voice message sender to notify them their audio message has been listened to. Also triggers a `chat:receipt` "read" event.

---

## WebRTC Call Signaling Events

### `call:offer` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Callee user ID
  callId?: string; // Optional call ID (generated if not provided)
  media?: "audio" | "video"; // Call media type (default: "video")
  offer: { // WebRTC RTCSessionDescription
    type: string;
    sdp?: string;
  };
}
```

**Acknowledgement**: `{ ok: boolean, callId?: string }`  
**Description**: Initiates a WebRTC call from caller to callee. The server:

1. Validates users are not blocked
2. Creates a `CallLog` document with status "ringing"
3. Sends an incoming call push notification to the callee
4. If callee is offline, marks call as missed immediately
5. If online, schedules a missed call timeout (`CALL_RING_TIMEOUT_SECONDS`)
6. Forwards the WebRTC offer to the callee

### `call:offer` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: WebRTC SDP offer forwarded to callee with additional metadata  
**Description**: Sent to the callee when they receive an incoming call. Contains all necessary WebRTC signaling data to answer the call.

### `call:answer` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Caller user ID
  callId: string;
  answer: { // WebRTC RTCSessionDescription
    type: string;
    sdp?: string;
  };
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Callee answers an incoming call. The server:

1. Updates the `CallLog` status to "answered"
2. Clears the ring timer
3. Sends a "call_started" system message to the chat
4. Ends any other active sessions for this call on the user's other devices
5. Forwards the WebRTC answer to the caller

### `call:answer` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: WebRTC SDP answer forwarded to caller  
**Description**: Sent to the caller when the callee accepts the call.

### `call:ice-candidate` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Other peer's user ID
  callId: string;
  candidate: { // WebRTC RTCIceCandidate
    candidate?: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
    usernameFragment?: string;
  };
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Forwards WebRTC ICE candidates between peers to establish the peer-to-peer connection. Sent immediately to avoid race conditions that could break the WebRTC handshake.

### `call:ice-candidate` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: ICE candidate forwarded to the other peer  
**Description**: Relays ICE candidates between caller and callee for WebRTC connection establishment.

### `call:end` (Client → Server)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Schema**:

```typescript
{
  to: string; // Other user's ID
  callId: string;
  reason?: string;
}
```

**Acknowledgement**: `{ ok: boolean }`  
**Description**: Either party ends the call. The server updates the `CallLog` status based on context:

- **If call was answered**: status = "ended"
- **If callee declines before answer**: status = "declined"
- **If caller cancels before answer**: status = "cancelled"
- **If timeout or user offline**: status = "missed"
  Creates a "call_ended" system message with call duration in the chat.

### `call:end` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**: Call end notification with reason  
**Description**: Sent to both parties when a call ends. Also sent to other devices of the answering user to end any duplicate call sessions.

### `call:missed` (Server → Client)

**File**: [`src/sockets/signaling.ts`](src/sockets/signaling.ts)  
**Payload**:

```typescript
{
  ok: true;
  callId: string;
  from: string; // Caller's user ID
  at: string; // ISO timestamp
}
```

**Description**: Sent to the callee when a call is missed due to timeout, or when the caller cancels while the call is still ringing. Also triggers a push notification for the missed call.

---

## All Events Alphabetical Index

| Event                 | Direction       | Category          | Source File                   |
| --------------------- | --------------- | ----------------- | ----------------------------- |
| `call:answer`         | Client ↔ Server | WebRTC Signaling  | `src/sockets/signaling.ts`    |
| `call:end`            | Client ↔ Server | WebRTC Signaling  | `src/sockets/signaling.ts`    |
| `call:ice-candidate`  | Client ↔ Server | WebRTC Signaling  | `src/sockets/signaling.ts`    |
| `call:missed`         | Server → Client | WebRTC Signaling  | `src/sockets/signaling.ts`    |
| `call:offer`          | Client ↔ Server | WebRTC Signaling  | `src/sockets/signaling.ts`    |
| `chat:delivered`      | Client → Server | Message Receipts  | `src/sockets/chatRealtime.ts` |
| `chat:enter`          | Client → Server | Chat Activity     | `src/sockets/chatRealtime.ts` |
| `chat:leave`          | Client → Server | Chat Activity     | `src/sockets/chatRealtime.ts` |
| `chat:message`        | Client ↔ Server | Chat Messaging    | `src/sockets/signaling.ts`    |
| `chat:ping`           | Client → Server | Chat Activity     | `src/sockets/chatRealtime.ts` |
| `chat:react`          | Client → Server | Message Reactions | `src/sockets/chatRealtime.ts` |
| `chat:reaction`       | Server → Client | Message Reactions | `src/sockets/chatRealtime.ts` |
| `chat:read`           | Client → Server | Message Receipts  | `src/sockets/chatRealtime.ts` |
| `chat:receipt`        | Server → Client | Message Receipts  | `src/sockets/chatRealtime.ts` |
| `chat:typing`         | Client ↔ Server | Chat Activity     | `src/sockets/chatRealtime.ts` |
| `chat:voice:listened` | Client ↔ Server | Voice Messages    | `src/sockets/chatRealtime.ts` |
| `connection`          | Server-only     | Lifecycle         | `src/sockets/index.ts`        |
| `disconnect`          | Server-only     | Lifecycle         | `src/sockets/index.ts`        |
| `presence:list`       | Client → Server | Presence          | `src/sockets/signaling.ts`    |
| `presence:me`         | Server → Client | Presence          | `src/sockets/index.ts`        |
| `presence:online`     | Server → Client | Presence          | `src/sockets/index.ts`        |
| `presence:ping`       | Client → Server | Presence          | `src/sockets/chatRealtime.ts` |
| `presence:update`     | Server → Client | Presence          | `src/sockets/index.ts`        |
| `share:item`          | Client ↔ Server | Chat Messaging    | `src/sockets/signaling.ts`    |

---

## Implementation Notes

### Socket Authentication

- Socket connections authenticated via JWT access token (production) or userId (development)
- Handshake auth: `{ accessToken: "<jwt>" }` or `{ userId: "<mongo-id>" }`
- All socket event payloads validated with Zod schemas before processing

### Timers & Timeouts

- **Chat inactivity timeout**: 30 seconds of no activity = user marked as inactive in chat
- **Call ring timeout**: Configurable via `CALL_RING_TIMEOUT_SECONDS` environment variable
- **Stale activity cleanup**: Server cleans up inactive chat entries every 10 seconds
- **Socket ping timeout**: 60 seconds, ping interval: 25 seconds (Socket.IO configuration)

### Persistence

- All messages, calls, receipts, and reactions persisted to MongoDB
- `lastSeenAt` updated on connection, disconnection, and presence pings
- Call logs track complete lifecycle: `offeredAt` → `answeredAt` → `endedAt`

### Push Notifications (FCM)

- Push notifications sent via Firebase Cloud Messaging only if recipient not active in chat
- New message, missed call, and incoming call notifications supported
- FCM tokens stored per user in the User document

### Data Validation

- All MongoDB ObjectIds validated with regex: `/^[a-fA-F0-9]{24}$/`
- Zod schemas enforce all payload constraints before processing
- Server never trusts client input - all permissions verified server-side

### Multi-Device Support

- Users can connect from multiple devices simultaneously
- Server maintains all active sockets for a user
- When a call is answered on one device, it's ended on all other devices
- Messages delivered to all of a user's connected devices
