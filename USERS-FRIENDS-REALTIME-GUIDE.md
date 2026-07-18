# Lover Link WebRTC Chat Server - User & Friends Module Integration Guide (End-to-End)

## 1. Overview

The User & Friends module provides comprehensive user discovery, relationship management, and real-time presence tracking functionality. It enables users to search for other users, send/accept/reject friend requests, manage relationships, block/report users, and maintain real-time presence status.

## 2. Core Architecture & Dependencies

### Key Files (From actual codebase)

| File                             | Purpose                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `src/routes/users.ts`            | All user and friends management REST endpoints (friend requests, search, presence)  |
| `src/middlewares/requireAuth.ts` | Express authentication middleware protecting all endpoints                          |
| `src/sockets/store.ts`           | In-memory store for online users and active connections tracking                    |
| `src/sockets/index.ts`           | Socket.IO connection initialization and presence events                             |
| `src/models/User.ts`             | MongoDB user model with friend relationship fields (implemented as Mongoose schema) |
| `src/models/Block.ts`            | MongoDB block relationship model with bidirectional block checks                    |
| `src/models/Report.ts`           | MongoDB user reporting model (created but not fully integrated in main user flow)   |
| `src/utils/helpers.ts`           | Helper functions including `isBlockedEitherWay()` for block validation              |
| `src/config/zod-validators.ts`   | Shared Zod validation schemas for ObjectId and common types                         |

### Core Dependencies

- Zod 3.23.8: Request validation with strict ObjectId format checking
- Mongoose 8.8.3: MongoDB ODM for database operations
- Socket.IO 4.7.5: Real-time communication for presence updates
- Other system-wide utilities: Reuses existing JWT, authentication, and security infrastructure

## 3. Database Models & Enums

### 3.1 User Document Model (Friendship Extensions - from src/models/User.ts)

Actual Mongoose schema implementation:

```typescript
const UserSchema = new Schema(
  {
    // ... other core fields (email, username, password, oauth, fcmTokens)
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }], // Array of mutually connected user IDs
    incomingFriendRequests: [{ type: Schema.Types.ObjectId, ref: "User" }], // Friend requests received
    outgoingFriendRequests: [{ type: Schema.Types.ObjectId, ref: "User" }], // Friend requests sent
    lastSeenAt: { type: Date, default: null }, // Last activity timestamp for presence
    profile: {
      displayName: String,
      bio: String,
      avatarUrl: String,
    },
  },
  { timestamps: true },
);
```

**Presence Tracking**:

- `lastSeenAt` is updated on socket disconnection via `listOnlineUsers()` and socket connection events
- Online status determined by presence in `sockets/store.ts` in-memory online users map

### 3.2 Block Document Model (from src/models/Block.ts)

```typescript
const BlockSchema = new Schema(
  {
    blocker: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blocked: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
```

**Unique Constraint**: `{ blocker: 1, blocked: 1 }` - prevents duplicate blocks
**Bidirectional Check**: `src/utils/helpers.ts` implements `isBlockedEitherWay()` which checks if either user has blocked the other, used in all friend-related endpoints.

```typescript
async function isBlockedEitherWay(u1: string, u2: string): Promise<boolean> {
  return Block.exists({
    $or: [
      { blocker: u1, blocked: u2 },
      { blocker: u2, blocked: u1 },
    ],
  });
}
```

### 3.3 Report Document Model

```typescript
export interface ReportDoc extends mongoose.Document {
  reporterId: mongoose.Types.ObjectId; // User who submitted the report
  targetUserId: mongoose.Types.ObjectId; // User being reported
  reason: string; // Required report reason (3-200 chars)
  details?: string; // Optional additional details (max 2000 chars)
  createdAt: Date;
  updatedAt: Date;
}
```

## 4. User Discovery & Presence APIs (from src/routes/users.ts)

### 4.1 Search Users

**Endpoint**: `GET /api/users/search` (protected)  
**Query Parameters**:

- `q`: Search query string (searches username and email case-insensitively, must be at least 2 characters)

**Success Response**:

```json
{
  "ok": true,
  "users": [
    {
      "id": "60d21b4667d0d8992e610c85",
      "email": "user@example.com",
      "username": "romanticpartner",
      "profile": { "displayName": "Romantic Partner", "avatarUrl": "..." }
    }
  ]
}
```

- Limits results to 20 users
- Returns only public user fields including profile data
- Excludes blocked users from search results using `isBlockedEitherWay()`

---

### 4.2 Get User Presence Status (Online/Offline)

**Endpoint**: `GET /api/users/presence` (protected)  
**Query Parameters**:

- `ids`: Comma-separated list of MongoDB ObjectIds (max 200)

**Success Response**:

```json
{
  "ok": true,
  "presence": [
    {
      "userId": "60d21b4667d0d8992e610c85",
      "isOnline": true,
      "lastSeenAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Logic**:

- `isOnline`: Derived from Socket.IO online user store (`listOnlineUsers()` from sockets/store.ts)
- `lastSeenAt`: From database user document, null if user not found
- This endpoint powers the "Active Now" status in the mobile app

---

### 4.2 Get Users by IDs

**Endpoint**: `GET /api/users/by-ids` (protected)  
**Query Parameters**:

- `ids`: Comma-separated list of MongoDB ObjectIds (max 200)

**Success Response**:

```json
{
  "ok": true,
  "users": [
    {
      "id": "60d21b4667d0d8992e610c85",
      "email": "user@example.com",
      "username": "romanticpartner",
      "lastSeenAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### 4.3 Get User Presence Status

**Endpoint**: `GET /api/users/presence` (protected)  
**Query Parameters**:

- `ids`: Comma-separated list of MongoDB ObjectIds (max 200)

**Success Response**:

```json
{
  "ok": true,
  "presence": [
    {
      "userId": "60d21b4667d0d8992e610c85",
      "isOnline": true,
      "lastSeenAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Logic**:

- `isOnline`: Derived from Socket.IO online user store (`listOnlineUsers()`)
- `lastSeenAt`: From database user document, null if user not found

## 5. Friendship Management APIs (from src/routes/users.ts)

### 5.1 Get Current User's Friends

**Endpoint**: `GET /api/users/friends` (protected)

**Success Response**:

```json
{
  "ok": true,
  "friends": [
    {
      "id": "60d21b4667d0d8992e610c85",
      "email": "partner@example.com",
      "username": "mylove"
    }
  ]
}
```

---

### 5.2 Send Friend Request

**Endpoint**: `POST /api/users/friends/request` (protected)
**Zod Validation Schema**:

```typescript
const RequestSchema = z.object({ toUserId: ObjectIdString });
```

**Request Payload**:

```json
{
  "toUserId": "60d21b4667d0d8992e610c85"
}
```

**Processing Logic**:

1. Check if target user is self: returns 400 error "InvalidTarget"
2. Check if either user has blocked the other using `isBlockedEitherWay()`: returns 403 error "Blocked"
3. Validate that users aren't already friends and no existing friend request exists
4. Add requester's ID to target's `incomingFriendRequests`
5. Add target's ID to requester's `outgoingFriendRequests`
6. Returns { ok: true } on success

---

### 5.3 Accept Friend Request

**Endpoint**: `POST /api/users/friends/accept` (protected)
**Zod Validation Schema**:

```typescript
const AcceptSchema = z.object({ fromUserId: ObjectIdString });
```

**Request Payload**:

```json
{
  "fromUserId": "60d21b4667d0d8992e610c86"
}
```

**Processing Logic**:

1. Validate that the incoming friend request actually exists from that user
2. Remove from `incomingFriendRequests` (accepter) and `outgoingFriendRequests` (requester)
3. Add each other to each other's `friends` array
4. Returns { ok: true } on success

---

### 5.4 Reject Friend Request

**Endpoint**: `POST /api/users/friends/reject` (protected)
Similar to accept but only removes the friend request without adding to friends list

---

### 5.5 Cancel Outgoing Friend Request

**Endpoint**: `POST /api/users/friends/cancel` (protected)
Removes the outgoing friend request you sent to another user

---

### 5.6 Remove Existing Friend

**Endpoint**: `POST /api/users/friends/remove` (protected)
Removes a user from your friends list, bidirectional removal

- `incoming`: Friend requests received from other users
- `outgoing`: Friend requests sent by current user

---

### 5.3 Send Friend Request

**Endpoint**: `POST /api/users/friends/request` (protected)  
**Zod Validation Schema**:

```typescript
const RequestSchema = z.object({
  toUserId: z.string().regex(/^[a-fA-F0-9]{24}$/), // Valid MongoDB ObjectId
});
```

**Request Payload**:

```json
{
  "toUserId": "60d21b4667d0d8992e610c85"
}
```

**Processing Logic**:

1. Prevent sending request to self
2. Check if either user has blocked the other (returns 403 if blocked)
3. Verify both users exist in database
4. Validate no existing friendship or pending request
5. Add to sender's `outgoingFriendRequests`
6. Add to receiver's `incomingFriendRequests`

**Error Codes**:

- `InvalidTarget` (400): Cannot send request to self
- `Blocked` (403): Users are blocked from interacting
- `NotFound` (404): Target user doesn't exist
- `AlreadyFriends` (409): Already connected as friends
- `AlreadyRequested` (409): Outgoing request already exists
- `IncomingRequestExists` (409): Incoming request already exists

**Success Response**: `{ "ok": true }` (201 Created)

---

### 5.4 Accept Friend Request

**Endpoint**: `POST /api/users/friends/accept` (protected)  
**Zod Validation Schema**:

```typescript
const AcceptSchema = z.object({
  fromUserId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});
```

**Request Payload**:

```json
{
  "fromUserId": "60d21b4667d0d8992e610c86"
}
```

**Processing Logic**:

1. Verify incoming request exists from the sender
2. Remove from both users' request queues
3. Add each other to `friends` array (mutual friendship)

**Error Codes**:

- `InvalidTarget` (400): Cannot accept request from self
- `Blocked` (403): Users are blocked
- `NotFound` (404): Current user not found
- `NoIncomingRequest` (409): No incoming request exists from this user

**Success Response**: `{ "ok": true }`

---

### 5.5 Reject Friend Request

**Endpoint**: `POST /api/users/friends/reject` (protected)  
**Same schema as accept**

**Processing Logic**:

- Removes the incoming request from receiver's list
- Removes the outgoing request from sender's list
- No mutual friendship created

**Success Response**: `{ "ok": true }`

---

### 5.6 Cancel Outgoing Friend Request

**Endpoint**: `POST /api/users/friends/cancel` (protected)  
**Zod Validation Schema**:

```typescript
const CancelSchema = z.object({
  toUserId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});
```

**Processing Logic**:

- Removes from sender's `outgoingFriendRequests`
- Removes from receiver's `incomingFriendRequests`

**Success Response**: `{ "ok": true }`

---

### 5.7 Unfriend a User

**Endpoint**: `POST /api/users/friends/unfriend` (protected)  
**Zod Validation Schema**:

```typescript
const UnfriendSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});
```

**Processing Logic**:

- Removes the user from both users' `friends` arrays
- Severs the mutual friendship

**Success Response**: `{ "ok": true }`

## 6. Block & Report System

### 6.1 Block a User

**Endpoint**: `POST /api/users/block` (protected)  
**Zod Validation Schema**:

```typescript
const BlockSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  reason: z.string().max(500).optional(),
});
```

**Request Payload**:

```json
{
  "userId": "60d21b4667d0d8992e610c88",
  "reason": "Inappropriate behavior"
}
```

**Processing Logic**:

1. Prevent blocking self
2. Upsert block record (create or update existing)
3. Remove user from both users' `friends` array
4. Remove all pending friend requests in both directions
5. Severs all connections between the users

**Success Response**: `{ "ok": true }`

---

### 6.2 Unblock a User

**Endpoint**: `POST /api/users/unblock` (protected)  
**Same schema as unfriend**

**Processing Logic**:

- Deletes the block record from database
- Does NOT automatically re-add the friendship (must re-send friend request)

**Success Response**: `{ "ok": true }`

---

### 6.3 Report a User

**Endpoint**: `POST /api/users/report` (protected)  
**Zod Validation Schema**:

```typescript
const ReportSchema = z.object({
  userId: z.string().regex(/^[a-fA-F0-9]{24}$/),
  reason: z.string().min(3).max(200),
  details: z.string().max(2000).optional(),
});
```

**Request Payload**:

```json
{
  "userId": "60d21b4667d0d8992e610c88",
  "reason": "Harassment",
  "details": "Additional context about the incident..."
}
```

**Processing Logic**:

- Creates report record in database for moderation
- Indexed by reporter, target, and creation date for efficient querying
- Does not automatically block the user (block is separate action)

**Success Response**: `{ "ok": true }` (201 Created)

## 7. Real-Time Presence System

### 7.1 Socket.IO Connection & Online Tracking

When a user connects via Socket.IO:

1. Authentication validates their user ID (see auth guide for details)
2. `addSocketForUser()` adds them to the online users store
3. Server updates their `lastSeenAt` in the database
4. All connected clients receive a presence update

### 7.2 Presence Events (Socket.IO)

#### Client Receives: `presence:online`

Emitted to newly connected client with all currently online users:

```json
{
  "ok": true,
  "users": ["60d21b4667d0d8992e610c85", "60d21b4667d0d8992e610c86"]
}
```

#### All Clients Receive: `presence:update`

Emitted to everyone when any user connects or disconnects:

```json
{
  "ok": true,
  "users": ["60d21b4667d0d8992e610c85", "60d21b4667d0d8992e610c87"]
}
```

#### Client Sends: `presence:ping`

Client can send this periodically to update their `lastSeenAt` timestamp, maintaining active presence status.

### 7.3 Online Store Implementation

The in-memory store (`src/sockets/store.ts`) maintains:

- `userToSocketIds`: Map of userId to set of active socket IDs (supports multiple devices)
- `socketIdToUser`: Reverse lookup from socket ID to user ID
- `listOnlineUsers()`: Returns array of all users with at least one active socket

## 8. Cross-Cutting Features

### 8.1 Bidirectional Block Checking

The `isBlockedEitherWay()` helper function used throughout the module:

```typescript
async function isBlockedEitherWay(a: string, b: string) {
  const existing = await BlockModel.findOne({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  })
    .select("_id")
    .lean();
  return Boolean(existing);
}
```

- Prevents any interaction between blocked users
- Used in friend request, chat, and WebRTC signaling flows

### 8.2 ObjectId Validation

All endpoint parameters accepting user IDs use strict Zod validation:

```typescript
const ObjectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/);
```

- Ensures only valid MongoDB ObjectIds are processed
- Prevents invalid database queries
- Applied to all user ID inputs across the module

### 8.3 Cleanup on Disconnect

When a socket disconnects:

1. `removeSocket()` removes socket from all stores
2. If user has no more active sockets, they're removed from online list
3. All clients receive `presence:update` to reflect offline status
4. `lastSeenAt` is updated in the database

## 9. Error Code Reference

| Error Code              | HTTP Status | Description                               |
| ----------------------- | ----------- | ----------------------------------------- |
| `NotFound`              | 404         | Requested user or resource not found      |
| `InvalidTarget`         | 400         | Cannot perform action on self             |
| `Blocked`               | 403         | Action blocked by user block relationship |
| `AlreadyFriends`        | 409         | Users are already friends                 |
| `AlreadyRequested`      | 409         | Outgoing friend request already exists    |
| `IncomingRequestExists` | 409         | Incoming friend request already exists    |
| `NoIncomingRequest`     | 409         | No incoming request to accept/reject      |

## 10. Integration Notes

### 10.1 Protected Route Usage

All endpoints in this module require authentication. The `requireAuth` middleware is applied to every route, ensuring only authenticated users can access user and friends functionality.

### 10.2 Real-Time Event Flow

Presence updates are automatically propagated to all connected clients. The server maintains the single source of truth for online users, eliminating the need for clients to poll for presence status.

### 10.3 Database Consistency

All friendship modifications use atomic MongoDB operations (`$addToSet`, `$pull`) to prevent race conditions when multiple requests modify the same user document simultaneously.

### 10.4 Cross-Module Integration

The block checking function is reused across other modules (chat, WebRTC signaling) to ensure blocked users cannot interact via any channel, maintaining consistent access control throughout the application.
