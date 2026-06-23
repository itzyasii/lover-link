---
name: "lover-link-project"
description: "LoverLink - A romantic couple/relationship chat application. Invoke when debugging, analyzing, creating modules, or adding features to maintain project conventions."
---

# LoverLink Project Skill

## Project Overview
**LoverLink** is a modern real-time chat and communication application designed for couples/romantic relationships. It provides messaging, voice/video calls, friend management, and push notifications through a clean, modern Next.js frontend.

## When to Invoke This Skill
- Debugging any application feature or bug
- Analyzing existing codebase architecture
- Creating new modules or features
- Adding new functionality to existing modules
- Refactoring code to maintain consistency
- Reviewing code for project standards compliance
- Setting up development environment
- Troubleshooting build or runtime issues

## Project Structure
```
lover-link/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Root page (auth redirect)
│   ├── globals.css              # Global styles
│   ├── login/                   # Login page
│   │   └── page.tsx
│   ├── signup/                  # Signup page
│   │   └── page.tsx
│   └── app/                     # Authenticated app routes
│       ├── layout.tsx           # Main app layout with navigation
│       ├── page.tsx             # Chats list page
│       ├── chat/[chatId]/       # Individual chat room
│       │   └── page.tsx
│       ├── friends/             # Friends management
│       │   └── page.tsx
│       └── calls/               # Calls history
│           └── page.tsx
├── components/                   # React components
│   ├── call/                    # Calling system
│   │   ├── CallOverlay.tsx
│   │   └── CallProvider.tsx
│   ├── chat/                    # Chat-specific components
│   │   ├── MediaAttachments.tsx
│   │   ├── MessageBubble.tsx
│   │   └── VoiceNotePlayer.tsx
│   ├── Brand.tsx                # App branding
│   ├── HeartbeatLoading.tsx     # Loading animation
│   ├── NotificationPermission.tsx
│   ├── Providers.tsx             # App providers wrapper
│   ├── RealtimeListener.tsx     # Socket.io real-time handler
│   └── Toasts.tsx               # Toast notifications
├── hooks/                        # Custom React hooks
│   ├── useFcm.ts                # Firebase Cloud Messaging hook
│   └── usePrefetchedQuery.ts    # React Query prefetch helper
├── lib/                          # Utility libraries & API clients
│   ├── api.ts                   # Centralized API fetch utility
│   ├── env.ts                   # Environment variables
│   ├── firebase.ts              # Firebase initialization
│   ├── socket.ts                # Socket.io client setup
│   ├── sounds.ts                # Sound effects management
│   ├── time.ts                  # Time formatting utilities
│   ├── users.ts                 # User-related helpers
│   └── utils.ts                 # General utilities (cn function)
├── stores/                       # Zustand state management
│   ├── auth.ts                  # Authentication state
│   ├── chats.ts                 # Chat list & unread counts
│   ├── typing.ts                # Typing indicators
│   ├── loading.ts               # Global loading state
│   └── toast.ts                 # Toast notifications state
├── types/                        # TypeScript type definitions
│   ├── chat.ts                  # Chat-related types
│   └── dotlottie-player.d.ts    # Lottie player types
├── public/                       # Static assets
│   ├── firebase-messaging-sw.js # FCM service worker
│   ├── heartbeat.lottie         # Heartbeat animation
│   ├── logo.svg
│   └── avatars/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.mjs
└── .env                         # Environment variables
```

## Core Technology Stack

### Frontend Framework
- **Next.js 16.1.6** - App Router, React Server Components
- **React 19.2.3** - Latest React version with modern hooks
- **TypeScript 5** - Full type safety throughout the codebase

### Styling
- **TailwindCSS 4** - Utility-first CSS with latest version
- **styled-components 6.4.2** - CSS-in-JS for complex components
- **clsx + tailwind-merge** - Conditional class name merging (via `cn()` utility)
- **framer-motion 12.23.12** - Animations and transitions

### State Management
- **Zustand 5.0.8** - Lightweight state management for global stores
- **@tanstack/react-query 5.87.4** - Server state management, caching, mutations
- **React Hook Form 7.63.0** - Form state management and validation
- **@hookform/resolvers** - Zod resolver for form validation

### Real-time Communication
- **Socket.io-client 4.8.1** - WebSocket connections for real-time features
- **Firebase 12.15.0** - Firebase Cloud Messaging for push notifications

### Media & Animations
- **wavesurfer.js 7.12.8** - Audio waveform visualization for voice messages
- **@dotlottie/player-component 2.7.12** - Lottie animations
- **emoji-picker-react 4.19.1** - Emoji selector for chat
- **react-draggable 4.7.0** - Draggable UI elements (call overlays)
- **react-intersection-observer 10.0.3** - Scroll-based infinite loading

### Data Validation & Types
- **Zod 3.25.76** - Schema validation for API data and forms
- **idb-keyval 6.2.5** - IndexedDB storage for offline capabilities

### UI Icons
- **lucide-react 0.542.0** - Modern icon library

## State Management Architecture

### Zustand Stores (Client-side State)
All stores follow the same pattern: `"use client";` directive, `create()` from zustand, typed state, actions with set/get.

1. **auth.ts** - Authentication state
   - `accessToken: string | null` - JWT access token
   - `user: User | null` - Current user object
   - `fcmToken: string | null` - Firebase Cloud Messaging token
   - Actions: `login()`, `signup()`, `logout()`, `refresh()`, `hydrateFromStorage()`
   - Persists token to localStorage

2. **chats.ts** - Chat management
   - `chats: Chat[]` - Array of chat objects
   - `unreadCounts: Record<string, number>` - Unread message counts per chat
   - Actions: `updateChatLastMessage()`, `incrementUnread()`, `resetUnread()`, `togglePin()`, `toggleMute()`

3. **typing.ts** - Typing indicators
   - Tracks which users are currently typing in which chats

4. **loading.ts** - Global loading states
   - Manages application-wide loading indicators

5. **toast.ts** - Toast notifications
   - Manages display of in-app notifications

### React Query (Server State)
Used for all API data fetching, caching, and background synchronization:
- Implements persistence with `async-storage-persister`
- Used for: chats list, messages, friends list, calls history, user data
- Keys follow pattern: `["chats"]`, `["messages", chatId]`, `["friends"]`, `["calls"]`
- Invalidates queries on real-time updates to keep data fresh

## API Integration Patterns

### Centralized API Fetch (`lib/api.ts`)
- Wraps fetch with automatic authorization header injection
- Handles token refresh automatically on 401 errors
- Provides typed responses with `apiFetch<T>()` generic
- All API calls use this utility, never raw fetch

### Environment Variables (`lib/env.ts`)
- All environment variables validated and exported from single source
- `API_BASE_URL` - Backend API endpoint
- Firebase config values validated at runtime

### Socket.io Integration (`lib/socket.ts`)
- Singleton socket instance created with `getSocket()`
- Automatically connects with auth token
- Handles reconnection logic
- Used by `RealtimeListener.tsx` to handle:
  - `new_message` - Incoming chat messages
  - `typing_start` / `typing_stop` - Typing indicators
  - `incoming_call` - VoIP call signaling
  - `call_ended` - Call termination
  - `user_online` / `user_offline` - Presence updates

## Firebase Integration (`lib/firebase.ts`)
- Firebase Cloud Messaging (FCM) for push notifications
- Service worker registered in root layout for background messages
- Foreground messages handled in-app for real-time updates
- Token management in auth store (register/unregister on login/logout)
- Handles notification permissions via `NotificationPermission.tsx`

## Routing Structure (Next.js App Router)

### Public Routes (unauthenticated)
- `/login` - User login page
- `/signup` - User registration page

### Protected Routes (authenticated - require valid JWT)
- `/app` - Main app entry, shows chat list
- `/app/chat/[chatId]` - Individual chat room
- `/app/friends` - Friends management, requests, search
- `/app/calls` - Call history, incoming/outgoing calls

### Root Layout (`app/layout.tsx`)
- Wraps entire application
- Sets up all providers: QueryClientProvider, CallProvider, etc.
- Initializes auth hydration from localStorage
- Handles initial auth check and redirects

### App Layout (`app/app/layout.tsx`)
- Sidebar navigation with links to Chats, Friends, Calls
- Socket connection initialization
- FCM message handling
- Real-time listener setup
- Call overlay provider
- Loading states while app data fetches

## Component Architecture Patterns

### Component Structure Rules
1. **All client components start with `"use client";`**
2. **Import order convention**:
   ```typescript
   // 1. React/Next.js imports
   // 2. External library imports (lucide, framer-motion, etc.)
   // 3. Internal components
   // 4. Stores/hooks
   // 5. Lib utilities
   // 6. Types
   ```

3. **Styling with `cn()` utility** - Always merge Tailwind classes using `cn()` from `@/lib/utils`
   ```typescript
   import { cn } from "@/lib/utils";
   // Usage: className={cn("base-class", condition && "conditional-class")}
   ```

4. **Store usage pattern** - Always select only what you need from stores:
   ```typescript
   const user = useAuthStore((s) => s.user);
   const accessToken = useAuthStore((s) => s.accessToken);
   ```

5. **React Query usage** - Always use the query client from `useQueryClient()`
   - Invalidate queries after mutations: `queryClient.invalidateQueries({ queryKey: ["chats"] })`

### Feature-based Component Organization
- Components grouped by feature: `/components/chat/`, `/components/call/`
- Shared components at root of `/components/`
- Each feature's components are co-located

## Type Definitions

### Core Entity Types

**User** (`stores/auth.ts`)
```typescript
type User = {
  id: string;
  email: string;
  username: string;
};
```

**Chat** (`stores/chats.ts`)
```typescript
type Chat = {
  id: string;
  type: "dm";
  members: ChatMember[];
  lastMessage?: LastMessage | null;
  isPinned?: boolean;
  isMuted?: boolean;
  updatedAt: string;
  createdAt?: string;
};
```

**Message** (implicit in API contracts)
```typescript
type Message = {
  id: string;
  chatId: string;
  from: string; // User ID
  type: "text" | "share" | "event";
  text?: string;
  item?: { kind: "file" | "image" | "video" | "audio"; url: string };
  event?: {
    kind: "call_started" | "call_ended";
    media: "audio" | "video";
  };
  createdAt: string;
};
```

## Backend API Endpoints (Pattern)

### Auth Endpoints
- `POST /api/auth/login` - User login, returns accessToken and user
- `POST /api/auth/signup` - User registration, returns accessToken and user
- `POST /api/auth/logout` - Logout, invalidates refresh token
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user profile

### Chat Endpoints
- `GET /api/chats` - Get all user's chats
- `GET /api/chats/:chatId/messages` - Get chat history
- `POST /api/chats/:chatId/messages` - Send new message
- `PUT /api/chats/:chatId/read` - Mark chat as read

### Friends Endpoints
- `GET /api/friends` - Get friends list
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept` - Accept friend request
- `POST /api/friends/reject` - Reject friend request

### Call Endpoints
- `POST /api/calls/initiate` - Start a new call
- `POST /api/calls/:callId/answer` - Answer incoming call
- `POST /api/calls/:callId/end` - End active call
- `GET /api/calls/history` - Get call history

### Notification Endpoints
- `POST /api/notifications/fcm/register` - Register FCM token
- `POST /api/notifications/fcm/unregister` - Unregister FCM token

## Development Workflow

### Available Scripts
```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build production bundle
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Environment Setup
Required environment variables in `.env.local`:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001  # Backend URL
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

## Code Standards & Conventions

### Naming Conventions
- **Files**: kebab-case for all files: `message-bubble.tsx`, `use-fcm.ts`
- **Components**: PascalCase: `MessageBubble`, `CallOverlay`
- **Hooks**: camelCase with use prefix: `useFcm`, `usePrefetchedQuery`
- **Stores**: camelCase with use*Store suffix: `useAuthStore`, `useChatsStore`
- **Utilities**: camelCase: `cn()`, `formatTime()`, `apiFetch()`
- **Types**: PascalCase: `User`, `Chat`, `Message`

### Import Aliases
- Use absolute imports with `@/` prefix for src directory:
  ```typescript
  import { useAuthStore } from "@/stores/auth";
  import { apiFetch } from "@/lib/api";
  import { cn } from "@/lib/utils";
  ```

### Error Handling Patterns
1. **API Errors**: Always catch and handle gracefully, show toast to user
2. **Auth Errors**: Trigger token refresh or redirect to login
3. **Socket Errors**: Implement reconnection with backoff
4. **Firebase Errors**: Log but don't break app functionality
5. **Console logging**: Prefix log messages: `[Auth]`, `[Socket]`, `[FCM]` for debugging

### State Update Patterns
1. **Immutable updates** in Zustand: always spread objects/arrays before modifying
2. **React Query invalidation** after all mutations to keep server state fresh
3. **Local storage sync** for auth tokens only, never for transient state
4. **Real-time events** always update both local state and invalidate queries

## Feature Implementation Requirements

When adding new features, follow existing patterns:

### 1. New UI Feature
- Create components in appropriate feature folder under `/components/`
- Add any required state to existing Zustand store or create new if needed
- Use React Query for any server data requirements
- Add route to `app/` directory if new page
- Update navigation in `app/app/layout.tsx` if needed

### 2. New API Integration
- Use `apiFetch()` from `@/lib/api.ts` for all API calls
- Add proper TypeScript types for request/response
- Implement error handling with user feedback
- Add React Query wrapper for caching if data is fetched frequently
- Update real-time listener if feature requires WebSocket events

### 3. New Real-time Feature
- Add socket event handler in `RealtimeListener.tsx`
- Update socket types if needed
- Implement proper state updates in relevant stores
- Add FCM notification handling if push notifications are needed
- Test offline/reconnection scenarios

### 4. State Management Additions
- Extend existing store before creating new ones
- Follow immutable update patterns
- Add proper TypeScript types for new state/actions
- Persist only necessary data to localStorage
- Clean up subscriptions in useEffect cleanup functions

## Common Pitfalls to Avoid

1. **Never use raw fetch()** - Always use `apiFetch()` for automatic auth handling
2. **Never store sensitive data in localStorage** - Only access tokens (which are short-lived)
3. **Don't create new state management solutions** - Use existing Zustand/React Query
4. **Don't skip type safety** - Always type all API responses and state
5. **Don't hardcode API URLs** - Always use `API_BASE_URL` from env.ts
6. **Don't ignore error cases** - Handle all failure scenarios gracefully
7. **Don't forget cleanup** - Always unsubscribe from sockets, remove event listeners
8. **Don't break real-time sync** - Ensure local state updates match server expectations

## Debugging Guide

### Common Issues & Solutions

**Auth Issues**
- Check that `accessToken` exists in auth store
- Verify token hasn't expired (should auto-refresh)
- Check network tab for 401 responses triggering refresh
- Clear localStorage and re-login if state is corrupted

**Real-time Issues**
- Check Socket.io connection status in dev tools
- Verify auth token is sent with socket connection
- Check CORS configuration on backend
- Look for `[Socket]` logs in console

**FCM/Push Notification Issues**
- Verify Firebase config is correct
- Check notification permissions granted
- Service worker registered successfully?
- FCM token sent to backend on login?

**Build Errors**
- Run `npm run lint` to catch syntax/type issues
- Verify all imports use correct `@/` alias
- Check TypeScript types with `tsc --noEmit`
- Clear `.next` folder and rebuild: `rm -rf .next && npm run build`

## Deployment

### Vercel Deployment
- Project is configured for Vercel deployment
- Set all environment variables in Vercel dashboard
- Build command: `npm run build`
- Output directory: `.next`

### Production Considerations
- Enable HTTPS only in production
- Set proper CORS policy on backend
- Configure Firebase for production
- Set up error tracking (Sentry, etc.)
- Enable CDN for static assets