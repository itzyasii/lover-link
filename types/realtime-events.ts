/**
 * Complete Real-Time Socket.IO Events Type Definitions
 * Generated from REALTIME_EVENTS.md - 100% accurate to server implementation
 */

// ============================================
// Connection & Lifecycle Events (Server-side only)
// ============================================

/**
 * `connection` - Internal server event when new Socket.IO connection is established
 */
export type ServerSideConnectionEvent = object;

/**
 * `disconnect` - Internal server event when client's socket connection terminates
 */
export type ServerSideDisconnectEvent = object;

// ============================================
// Presence & Online Status Events
// ============================================

/**
 * `presence:list` - Client -> Server: Request list of currently online users
 */
export type PresenceListClientEvent = object;

export interface PresenceListServerResponse {
  ok: true;
  users: string[]; // Array of online user IDs
}

/**
 * `presence:me` - Server -> Client: Confirm identity and successful authentication
 */
export interface PresenceMeServerEvent {
  ok: true;
  userId: string;
}

/**
 * `presence:online` - Server -> Client: Complete list of online users at connection time
 */
export interface PresenceOnlineServerEvent {
  ok: true;
  users: string[]; // Array of all online user IDs
}

/**
 * `presence:ping` - Client -> Server: Keep-alive ping to maintain online presence
 */
export type PresencePingClientEvent = object;

/**
 * `presence:update` - Server -> All clients: Broadcast when online user list changes
 */
export interface PresenceUpdateServerEvent {
  ok: true;
  users: string[]; // Updated array of all online user IDs
}

// ============================================
// Chat Activity Events
// ============================================

/**
 * `chat:enter` - Client -> Server: Client has entered a specific chat
 */
export interface ChatEnterClientEvent {
  chatId: string; // MongoDB ObjectId (24-char hex)
}

export interface ChatEnterServerResponse {
  ok: boolean;
}

/**
 * `chat:leave` - Client -> Server: Client has left a specific chat
 */
export interface ChatLeaveClientEvent {
  chatId: string; // MongoDB ObjectId (24-char hex)
}

export interface ChatLeaveServerResponse {
  ok: boolean;
}

/**
 * `chat:ping` - Client -> Server: Keep-alive to maintain active status in chat
 */
export interface ChatPingClientEvent {
  chatId: string; // MongoDB ObjectId (24-char hex)
}

export interface ChatPingServerResponse {
  ok: boolean;
}

/**
 * `chat:typing` - Client -> Server: Client sends typing indicator status
 */
export interface ChatTypingClientEvent {
  chatId: string; // MongoDB ObjectId
  isTyping: boolean;
}

export interface ChatTypingServerResponse {
  ok: boolean;
}

/**
 * `chat:typing` - Server -> Client: Forwarded typing status to other participant
 */
export interface ChatTypingServerEvent {
  ok: true;
  chatId: string;
  from: string; // User ID of the person typing
  isTyping: boolean;
}

export interface ChatHeartClientEvent {
  chatId: string;
}

export interface ChatHeartServerResponse {
  ok: boolean;
}

export interface ChatHeartServerEvent {
  chatId: string;
  from: string;
}

// ============================================
// Chat Messaging Events
// ============================================

/**
 * `chat:message` - Client -> Server: Client sends a text message to another user
 */
export interface ChatMessageClientEvent {
  to: string; // Recipient user ID (MongoDB ObjectId)
  clientMessageId?: string; // Optional client-side UUID for deduplication
  text: string; // Message content (1-4000 characters)
}

export interface ChatMessageServerResponse {
  ok: boolean;
  chatId?: string;
  messageId?: string;
}

/**
 * `chat:message:edit` - Client -> Server: Client edits an existing message
 */
export interface ChatMessageEditClientEvent {
  messageId: string; // ID of message to edit
  text: string; // Updated message content
}

export interface ChatMessageEditServerResponse {
  ok: boolean;
  error?: string;
}

/**
 * `chat:message:edited` - Server -> Client: Broadcast when a message is edited
 */
export interface ChatMessageEditedServerEvent {
  ok: true;
  chatId: string;
  messageId: string;
  text: string;
  editedAt: string; // ISO timestamp
}

/**
 * `chat:message:delete` - Client -> Server: Client deletes an existing message
 */
export interface ChatMessageDeleteClientEvent {
  messageId: string; // ID of message to delete
}

export interface ChatMessageDeleteServerResponse {
  ok: boolean;
  error?: string;
}

/**
 * `chat:message:deleted` - Server -> Client: Broadcast when a message is deleted
 */
export interface ChatMessageDeletedServerEvent {
  ok: true;
  chatId: string;
  messageId: string;
  deletedAt: string; // ISO timestamp
}

/**
 * Shared item structure for media/file sharing
 */
export interface ShareItem {
  kind: "file" | "image" | "video" | "audio";
  url: string;
  originalName?: string;
  mime?: string;
  size?: number;
  meta?: Record<string, unknown>;
}

/**
 * Event item structure for system events (call started/ended)
 */
export interface EventItem {
  kind: "call_started" | "call_ended";
  media?: "audio" | "video";
}

/**
 * Link preview structure for OpenGraph previews
 */
export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  url: string;
}

/**
 * Receipt structure for message delivery status
 */
export interface MessageReceipt {
  userId: string;
  deliveredAt?: string | Date;
  readAt?: string | Date;
  listenedAt?: string | Date;
}

/**
 * Reaction structure for message reactions
 */
export interface MessageReaction {
  emoji: string;
  userId: string;
  user: {
    id: string;
    username?: string;
    email?: string;
  };
  createdAt: string; // ISO timestamp
}

/**
 * Complete message structure sent from server to clients
 */
export interface Message {
  id: string;
  chatId: string;
  from: string;
  type: "text" | "event" | "share";
  clientMessageId: string | null;
  text: string | null;
  item?: ShareItem;
  event?: EventItem;
  receipts: MessageReceipt[];
  reactions: MessageReaction[];
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  linkPreview?: LinkPreview;
}

/**
 * `chat:message` - Server -> Client: Broadcasted to both participants when new message is created
 */
export interface ChatMessageServerEvent {
  ok: true;
  chatId: string;
  message: Message;
}

/**
 * `share:item` - Client -> Server: Client sends a media/file share to another user
 */
export interface ShareItemClientEvent {
  to: string; // Recipient user ID
  clientMessageId?: string; // Optional deduplication ID
  item: ShareItem;
}

export interface ShareItemServerResponse {
  ok: boolean;
  chatId?: string;
  messageId?: string;
}

/**
 * `share:item` - Server -> Client: Broadcasted to both participants when new media share is created
 */
export interface ShareItemServerEvent {
  ok: true;
  chatId: string;
  message: Message;
}

// ============================================
// Message Receipt & Status Events
// ============================================

/**
 * `chat:delivered` - Client -> Server: Client acknowledges receipt of messages
 */
export interface ChatDeliveredClientEvent {
  messageIds: string[]; // Array of message IDs (1-200 max)
}

export interface ChatDeliveredServerResponse {
  ok: boolean;
}

/**
 * `chat:read` - Client -> Server: Client acknowledges that messages have been read
 */
export interface ChatReadClientEvent {
  messageIds: string[]; // Array of message IDs (1-200 max)
}

export interface ChatReadServerResponse {
  ok: boolean;
}

/**
 * `chat:receipt` - Server -> Client: Sent to message sender when messages are delivered/read
 */
export interface ChatReceiptServerEvent {
  ok: true;
  type: "delivered" | "read" | "listened";
  messageIds: string[];
  userId: string; // User who acknowledged the messages
  chatId: string;
  at: string; // ISO timestamp
}

// ============================================
// Message Reaction Events
// ============================================

/**
 * `chat:react` - Client -> Server: Client adds or removes an emoji reaction to a message
 */
export interface ChatReactClientEvent {
  messageId: string; // Message to react to
  emoji: string; // Emoji string (supports multi-codepoint sequences)
}

export interface ChatReactServerResponse {
  ok: boolean;
  action?: "added" | "removed";
  user?: {
    id: string;
    username?: string;
    email?: string;
  };
  error?: string;
}

/**
 * `chat:reaction` - Server -> Client: Broadcast to all chat members when reaction changes
 */
export interface ChatReactionServerEvent {
  ok: true;
  chatId: string;
  messageId: string;
  emoji: string;
  userId: string;
  user: {
    id: string;
    username?: string;
    email?: string;
  };
  action: "added" | "removed";
  at: string; // ISO timestamp
}

/**
 * `chat:like` - Client -> Server: Client likes or unlikes a message
 */
export interface ChatLikeClientEvent {
  messageId: string;
}

/**
 * `chat:like` - Server -> Client (Callback): Acknowledgment
 */
export interface ChatLikeServerResponse {
  ok: boolean;
  action?: "added" | "removed";
  user?: {
    id: string;
    username?: string;
    email?: string;
  };
  error?: string;
}

/**
 * `chat:like` - Server -> Client: Broadcast to all chat members when like changes
 */
export interface ChatLikeServerEvent {
  ok: true;
  chatId: string;
  messageId: string;
  userId: string;
  user: {
    id: string;
    username?: string;
    email?: string;
  };
  action: "added" | "removed";
  at: string; // ISO timestamp
}

// ============================================
// Voice Message Specific Events
// ============================================

/**
 * `chat:voice:listened` - Client -> Server: Client notifies server a voice message was listened to
 */
export interface ChatVoiceListenedClientEvent {
  messageId: string; // Voice message that was listened to
}

export interface ChatVoiceListenedServerResponse {
  ok: boolean;
  error?: string;
}

/**
 * `chat:voice:listened` - Server -> Client: Sent to voice message sender when their audio was listened to
 */
export interface ChatVoiceListenedServerEvent {
  ok: true;
  chatId: string;
  messageId: string;
  userId: string; // User who listened to the message
  at: string; // ISO timestamp
}

// ============================================
// WebRTC Call Signaling Events
// ============================================

/**
 * `call:offer` - Client -> Server: Initiates a WebRTC call from caller to callee
 */
export interface CallOfferClientEvent {
  to: string; // Callee user ID
  callId?: string; // Optional call ID (generated if not provided)
  media?: "audio" | "video"; // Call media type (default: "video")
  offer: RTCSessionDescriptionInit; // WebRTC RTCSessionDescription
  fromUser?: {
    // Caller's user info to send to callee
    id: string;
    email: string;
    username: string;
  };
}

export interface CallOfferServerResponse {
  ok: boolean;
  callId?: string;
}

/**
 * `call:offer` - Server -> Client: Sent to callee when they receive an incoming call
 */
export interface CallOfferServerEvent {
  from: string; // Caller user ID
  to: string; // Callee user ID
  callId: string;
  media: "audio" | "video";
  offer: RTCSessionDescriptionInit;
  callerName?: string;
}

/**
 * `call:answer` - Client -> Server: Callee answers an incoming call
 */
export interface CallAnswerClientEvent {
  to: string; // Caller user ID
  callId: string;
  answer: RTCSessionDescriptionInit; // WebRTC RTCSessionDescription
}

export interface CallAnswerServerResponse {
  ok: boolean;
}

/**
 * `call:answer` - Server -> Client: Sent to caller when callee accepts the call
 */
export interface CallAnswerServerEvent {
  from: string; // Callee user ID
  to: string; // Caller user ID
  callId: string;
  answer: RTCSessionDescriptionInit;
}

/**
 * `call:ice-candidate` - Client -> Server: Forwards WebRTC ICE candidates between peers
 */
export interface CallIceCandidateClientEvent {
  to: string; // Other peer's user ID
  callId: string;
  candidate: RTCIceCandidateInit; // WebRTC RTCIceCandidate
}

export interface CallIceCandidateServerResponse {
  ok: boolean;
}

/**
 * `call:ice-candidate` - Server -> Client: Relays ICE candidates between caller and callee
 */
export interface CallIceCandidateServerEvent {
  to: string; // Recipient user ID
  callId: string;
  candidate: RTCIceCandidateInit;
}

/**
 * `call:end` - Client -> Server: Either party ends the call
 */
export interface CallEndClientEvent {
  to: string; // Other user's ID
  callId: string;
  reason?: string;
}

export interface CallEndServerResponse {
  ok: boolean;
}

/**
 * `call:end` - Server -> Client: Sent to both parties when a call ends
 */
export interface CallEndServerEvent {
  ok: boolean;
  callId: string;
  reason: string;
}

/**
 * `call:missed` - Server -> Client: Sent to callee when a call is missed
 */
export interface CallMissedServerEvent {
  ok: true;
  callId: string;
  from: string; // Caller's user ID
  at: string; // ISO timestamp
}

// ============================================
// Combined Server Events Type for type-safe socket listening
// ============================================

/**
 * All server-to-client events with their payload types
 */
export interface ServerToClientEvents {
  // Presence events
  "presence:me": (data: PresenceMeServerEvent) => void;
  "presence:online": (data: PresenceOnlineServerEvent) => void;
  "presence:update": (data: PresenceUpdateServerEvent) => void;

  // Chat activity events
  "chat:typing": (data: ChatTypingServerEvent) => void;

  // Chat messaging events
  "chat:message": (data: ChatMessageServerEvent) => void;
  "share:item": (data: ShareItemServerEvent) => void;
  "chat:message:edited": (data: ChatMessageEditedServerEvent) => void;
  "chat:message:deleted": (data: ChatMessageDeletedServerEvent) => void;

  // Message receipt events
  "chat:receipt": (data: ChatReceiptServerEvent) => void;

  // Message reaction events
  "chat:reaction": (data: ChatReactionServerEvent) => void;
  "chat:like": (data: ChatLikeServerEvent) => void;
  "chat:heart": (data: ChatHeartServerEvent) => void;

  // Voice message events
  "chat:voice:listened": (data: ChatVoiceListenedServerEvent) => void;

  // WebRTC call events
  "call:offer": (data: CallOfferServerEvent) => void;
  "call:answer": (data: CallAnswerServerEvent) => void;
  "call:ice-candidate": (data: CallIceCandidateServerEvent) => void;
  "call:end": (data: CallEndServerEvent) => void;
  "call:missed": (data: CallMissedServerEvent) => void;
}

/**
 * All client-to-server events with their payload types
 */
export interface ClientToServerEvents {
  // Presence events
  "presence:list": (
    callback: (response: PresenceListServerResponse) => void,
  ) => void;
  "presence:ping": () => void;

  // Chat activity events
  "chat:enter": (
    data: ChatEnterClientEvent,
    callback: (response: ChatEnterServerResponse) => void,
  ) => void;
  "chat:leave": (
    data: ChatLeaveClientEvent,
    callback: (response: ChatLeaveServerResponse) => void,
  ) => void;
  "chat:ping": (
    data: ChatPingClientEvent,
    callback: (response: ChatPingServerResponse) => void,
  ) => void;
  "chat:typing": (
    data: ChatTypingClientEvent,
    callback: (response: ChatTypingServerResponse) => void,
  ) => void;

  // Chat messaging events
  "chat:message": (
    data: ChatMessageClientEvent,
    callback: (response: ChatMessageServerResponse) => void,
  ) => void;
  "share:item": (
    data: ShareItemClientEvent,
    callback: (response: ShareItemServerResponse) => void,
  ) => void;
  "chat:message:edit": (
    data: ChatMessageEditClientEvent,
    callback: (response: ChatMessageEditServerResponse) => void,
  ) => void;
  "chat:message:delete": (
    data: ChatMessageDeleteClientEvent,
    callback: (response: ChatMessageDeleteServerResponse) => void,
  ) => void;

  // Message receipt events
  "chat:delivered": (
    data: ChatDeliveredClientEvent,
    callback: (response: ChatDeliveredServerResponse) => void,
  ) => void;
  "chat:read": (
    data: ChatReadClientEvent,
    callback: (response: ChatReadServerResponse) => void,
  ) => void;

  // Message reaction events
  "chat:react": (
    data: ChatReactClientEvent,
    callback: (response: ChatReactServerResponse) => void,
  ) => void;
  "chat:like": (
    data: ChatLikeClientEvent,
    callback: (response: ChatLikeServerResponse) => void,
  ) => void;
  "chat:heart": (
    data: ChatHeartClientEvent,
    callback: (response: ChatHeartServerResponse) => void,
  ) => void;

  // Voice message events
  "chat:voice:listened": (
    data: ChatVoiceListenedClientEvent,
    callback: (response: ChatVoiceListenedServerResponse) => void,
  ) => void;

  // WebRTC call events
  "call:offer": (
    data: CallOfferClientEvent,
    callback: (response: CallOfferServerResponse) => void,
  ) => void;
  "call:answer": (
    data: CallAnswerClientEvent,
    callback: (response: CallAnswerServerResponse) => void,
  ) => void;
  "call:ice-candidate": (
    data: CallIceCandidateClientEvent,
    callback: (response: CallIceCandidateServerResponse) => void,
  ) => void;
  "call:end": (
    data: CallEndClientEvent,
    callback: (response: CallEndServerResponse) => void,
  ) => void;
}

// ============================================
// Socket.IO type augmentation for type safety
// ============================================

// Socket.io types are used directly by importing Socket<ServerToClientEvents, ClientToServerEvents>
// No need to augment the module - the project already uses the correct generic typing
