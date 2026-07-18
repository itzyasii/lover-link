# Lover Link WebRTC Chat Server - Auth Module Integration Guide (End-to-End)

## 1. Overview

The Lover Link auth module implements a secure, production-grade authentication system combining:

- JWT-based access tokens for API authentication
- HTTP-only cookie-stored refresh tokens for session management
- Email/password authentication with bcryptjs password hashing
- FCM token management for push notifications (Firebase Cloud Messaging)
- Socket.IO real-time connection authentication

_Note: Google OAuth 2.0 integration is currently configured but not fully implemented in the production codebase._

## 2. Core Architecture & Dependencies

### Key Files

| File                             | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `src/auth/password.ts`           | bcryptjs password hashing/verification                     |
| `src/auth/tokens.ts`             | JWT signing/verification, refresh token generation/hashing |
| `src/routes/auth.ts`             | All authentication REST endpoints                          |
| `src/middlewares/requireAuth.ts` | Express middleware to protect private routes               |
| `src/sockets/index.ts`           | Socket.IO connection authentication middleware             |
| `src/models/User.ts`             | MongoDB user document schema                               |
| `src/models/RefreshToken.ts`     | MongoDB refresh token storage schema                       |
| `src/config/env.ts`              | Environment configuration and validation                   |

### Environment Configuration (from src/config/env.ts)

- `JWT_ACCESS_SECRET`: Secret for signing access tokens (required in production)
- `JWT_REFRESH_SECRET`: Secret for refresh tokens (required in production)
- `ACCESS_TOKEN_TTL_MINUTES`: Access token expiration (default: 1440 minutes / 1 day)
- `REFRESH_TOKEN_TTL_DAYS`: Refresh token expiration (default: 30 days)
- `REFRESH_COOKIE_NAME`: Cookie name for storing refresh token (default: "rt")
- `COOKIE_SECURE`: Enable secure cookies (HTTPS only, default: false)
- `COOKIE_DOMAIN`: Domain for refresh cookie (optional)
- Google OAuth credentials (configured but not fully implemented): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

## 3. Authentication Flows

### 3.1 Email/Password Signup Flow

**Endpoint**: `POST /api/auth/signup`  
**Zod Validation Schema** (from src/routes/auth.ts):

```typescript
const SignupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(200),
  fcmToken: z.string().optional().nullable(), // FCM token is optional, can be null or omitted entirely
});
```

**Request Payload Example**:

```json
{
  "email": "user@example.com",
  "username": "romanticpartner",
  "password": "securepassword123",
  "fcmToken": "firebase-cloud-messaging-token-abc123"
}
```

**Processing Steps**:

1. Check if user with same email (case-insensitive) or username already exists
2. If FCM token provided: Remove from all existing user accounts to prevent cross-account notifications
3. Hash password with bcryptjs
4. Create new user document in MongoDB
5. Generate refresh token (crypto.randomBytes(48).toString("base64url")), hash it with SHA-256, store in `RefreshToken` collection
6. Set refresh token as HTTP-only cookie with SameSite: lax, domain configured from environment
7. Sign JWT access token with user ID as subject (payload includes `typ: "access"`)
8. Return access token and user details

**Success Response (201 Created)**:

```json
{
  "ok": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60d21b4667d0d8992e610c85",
    "email": "user@example.com",
    "username": "romanticpartner"
  }
}
```

**Error Response (409 Conflict)**:

```json
{
  "ok": false,
  "error": "UserAlreadyExists"
}
```

---

### 3.2 Email/Password Login Flow

**Endpoint**: `POST /api/auth/login`  
**Zod Validation Schema** (from src/routes/auth.ts):

```typescript
const LoginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
  fcmToken: z.string().optional().nullable(), // FCM token is optional, can be null or omitted entirely
});
```

**Request Payload Example**:

```json
{
  "emailOrUsername": "romanticpartner",
  "password": "securepassword123",
  "fcmToken": "firebase-cloud-messaging-token-abc123"
}
```

**Processing Steps**:

1. Find user by email (case-insensitive) or username
2. Verify password bcryptjs hash matches
3. If FCM token provided: Remove from all other user accounts, add to current user's `fcmTokens` array (using $addToSet to avoid duplicates)
4. Create new refresh token, store hashed version in RefreshToken collection
5. Set refresh cookie, generate access token
6. Return tokens and user details

**Success Response (200 OK)**:

```json
{
  "ok": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60d21b4667d0d8992e610c85",
    "email": "user@example.com",
    "username": "romanticpartner"
  }
}
```

**Error Response (401 Unauthorized)**:

```json
{
  "ok": false,
  "error": "InvalidCredentials"
}
```

---

### 3.3 Token Refresh Flow

**Endpoint**: `POST /api/auth/refresh`  
**Zod Validation Schema**:

```typescript
const RefreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});
```

**Request Payload (optional, if not using cookies)**:

```json
{
  "refreshToken": "base64url-encoded-refresh-token-xyz789"
}
```

**Processing Steps**:

1. Extract refresh token from request body or `REFRESH_COOKIE_NAME` cookie
2. Hash the refresh token and lookup in `RefreshToken` collection
3. Validate token: not revoked, not expired
4. Generate new refresh token, store hashed version
5. Mark old refresh token as revoked, set `replacedByHash` to new token's hash
6. Set new refresh cookie, generate new access token
7. Return new access token

**Success Response (200 OK)**:

```json
{
  "ok": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (401 Unauthorized)**:

```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

---

### 3.4 Logout Flow

**Endpoint**: `POST /api/auth/logout` (protected by `requireAuth` middleware)  
**Zod Validation Schema**:

```typescript
const LogoutSchema = z.object({
  fcmToken: z.string().optional(),
});
```

**Request Payload Example**:

```json
{
  "fcmToken": "firebase-cloud-messaging-token-abc123"
}
```

**Processing Steps**:

1. Extract refresh token from cookie
2. Revoke refresh token in database (set `revokedAt`)
3. Clear all FCM tokens from user's account (`$set: { fcmTokens: [] }`)
4. Clear refresh cookie client-side
5. Return success response

**Success Response (200 OK)**:

```json
{
  "ok": true,
  "message": "Logged out successfully"
}
```

---

### 3.5 Get Current User Flow

**Endpoint**: `GET /api/auth/me` (protected)  
**Processing Steps**:

1. `requireAuth` middleware validates access token, attaches user ID to request
2. Lookup user by ID from database
3. Return sanitized user details

**Success Response (200 OK)**:

```json
{
  "ok": true,
  "user": {
    "id": "60d21b4667d0d8992e610c85",
    "email": "user@example.com",
    "username": "romanticpartner"
  }
}
```

---

### 3.6 Google OAuth Flow

#### Step 1: Get Google OAuth URL

**Endpoint**: `GET /api/auth/oauth/google/url`  
**Query Parameters**: `state` (optional - client-provided state string)

**Success Response**:

```json
{
  "ok": true,
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...",
  "state": "generated-nanoid-state-123"
}
```

#### Step 2: OAuth Callback Exchange

**Endpoint**: `POST /api/auth/oauth/google/callback`  
**Zod Validation Schema**:

```typescript
const GoogleCallbackSchema = z.object({
  code: z.string().min(1),
});
```

**Request Payload**:

```json
{
  "code": "google-authorization-code-abc123"
}
```

**Processing Steps**:

1. Exchange authorization code for Google access token and ID token
2. Verify ID token signature and audience matches Google Client ID
3. Lookup existing user by OAuth provider + provider user ID, or by email
4. If no user exists: Create new user with auto-generated username
5. If user exists without OAuth: Attach Google OAuth details to existing account
6. Generate refresh and access tokens, set refresh cookie
7. Return tokens and user details

**Success Response**: Same as login success response

**Possible Error Codes**:

- `GoogleOAuthNotConfigured` (501): OAuth credentials missing from environment
- `OAuthExchangeFailed` (401): Failed to exchange code for tokens
- `OAuthTokenInvalid` (401): Invalid ID token received
- `OAuthEmailMissing` (401): Google account didn't return an email address

## 4. Socket.IO Connection Authentication

**From src/sockets/index.ts**: When connecting to Socket.IO real-time server, clients must authenticate using one of two methods:

### Method 1: JWT Access Token (Recommended)

```javascript
const socket = io(serverUrl, {
  auth: {
    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
  transports: ["websocket", "polling"], // Required transports
});
```

**Server-side validation**:

1. Extract `accessToken` from `socket.handshake.auth`
2. Verify JWT signature and type (`typ: "access"`) using `verifyAccessToken()`
3. Attach user ID to `socket.data.userId`
4. Allow connection

### Method 2: User ID (For legacy/integrated connections - NOT recommended for production)

```javascript
const socket = io(serverUrl, {
  auth: {
    userId: "60d21b4667d0d8992e610c85",
  },
});
```

**Server-side validation**:

1. Validate userId is a valid 24-character MongoDB ObjectId (regex: `/^[a-fA-F0-9]{24}$/`)
2. Attach to `socket.data.userId`
3. Allow connection (only use in trusted internal environments)
4. Also supports userId from query parameters for fallback compatibility

### Connection Failure Response

If authentication fails, server emits an error with message:

- "invalid access token": JWT validation failed
- "valid userId (MongoDB ObjectId) or valid accessToken required": Neither authentication method provided or invalid

## 5. Database Schemas & Enums

### 5.1 RefreshToken Document Model

```typescript
export interface RefreshTokenDoc extends mongoose.Document {
  userId: mongoose.Types.ObjectId; // Reference to User
  tokenHash: string; // SHA-256 hash of refresh token
  expiresAt: Date; // Expiration timestamp
  revokedAt?: Date; // When token was revoked (logout/refresh)
  replacedByHash?: string; // Hash of new token that replaced this one
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.2 User Document Model

```typescript
export type OAuthProvider = "google";

export interface UserDoc extends mongoose.Document {
  email: string;
  username: string;
  passwordHash?: string; // Only for email/password auth users
  friends: mongoose.Types.ObjectId[];
  incomingFriendRequests: mongoose.Types.ObjectId[];
  outgoingFriendRequests: mongoose.Types.ObjectId[];
  lastSeenAt?: Date;
  fcmTokens: string[]; // Firebase Cloud Messaging tokens array
  oauth?: {
    provider: OAuthProvider; // Enum: only "google" currently supported
    providerUserId: string; // Google's unique user ID
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**OAuth Provider Enum Values**: Currently only `"google"` is supported, schema enforces this restriction.

## 6. Error Code Reference

All auth endpoints return standardized error responses with these codes:

| Error Code                 | HTTP Status | Description                                                    |
| -------------------------- | ----------- | -------------------------------------------------------------- |
| `UserAlreadyExists`        | 409         | User with same email or username already registered            |
| `InvalidCredentials`       | 401         | Login failed - wrong password or user not found                |
| `Unauthorized`             | 401         | Invalid/missing access token, or invalid/expired refresh token |
| `NotFound`                 | 404         | `/auth/me` called for non-existent user                        |
| `GoogleOAuthNotConfigured` | 501         | Google OAuth credentials not configured in environment         |
| `OAuthExchangeFailed`      | 401         | Failed to exchange Google authorization code                   |
| `OAuthTokenInvalid`        | 401         | Google ID token failed validation                              |
| `OAuthEmailMissing`        | 401         | Google account didn't return an email address                  |

## 7. API Protected Route Usage

All private API routes must use the `requireAuth` middleware:

```typescript
import { requireAuth } from "../middlewares/requireAuth";

router.get("/api/protected/resource", requireAuth, async (req, res) => {
  // req.user!.id contains authenticated user's MongoDB ID
  const userId = req.user!.id;
  // ... route logic
});
```

**Authorization Header Format**:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 8. Security Features

1. **HTTP-only Cookies**: Refresh tokens stored in HTTP-only, Secure (if enabled) cookies to prevent XSS theft
2. **Password Hashing**: All passwords hashed with bcrypt (12 rounds) - never stored plaintext
3. **Token Rotation**: Refresh tokens are rotated on each use - old tokens revoked
4. **FCM Token Isolation**: FCM tokens removed from all accounts before adding to current user to prevent cross-account notifications
5. **JWT Validation**: Access tokens strictly validated with type checking (`typ: "access"`) to prevent token reuse from other token types
6. **MongoDB ObjectId Validation**: Socket.IO userId connections validated to ensure proper ObjectId format to prevent invalid user IDs
