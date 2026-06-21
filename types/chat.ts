export type Chat = {
  id: string;
  type: "dm";
  members: ChatMember[];
};

export type ChatMember =
  | string
  | { id: string; email?: string; username?: string };

export type ShareItem = {
  kind?: "file" | "image" | "video" | "audio";
  url?: string;
  legacyUrl?: string;
  originalName?: string;
  mime?: string;
  size?: number;
  meta?: Record<string, unknown>;
} & Record<string, unknown>;

export type ReactionUser = {
  id: string;
  username?: string;
  email?: string;
};

export type Msg = {
  id: string;
  chatId: string;
  from: string;
  type: "text" | "share" | "event";
  text: string | null;
  item: ShareItem | null;
  event?: {
    kind: "call_started" | "call_ended";
    media: "audio" | "video";
    callId: string;
    by: string;
    durationMs?: number;
  } | null;
  receipts: {
    userId: string;
    deliveredAt?: string;
    readAt?: string;
    listenedAt?: string;
  }[];
  reactions?: {
    emoji: string;
    userId: string;
    createdAt: string;
    user?: ReactionUser;
  }[];
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  };
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ReactionAck = {
  ok: boolean;
  action?: "added" | "removed";
  user?: ReactionUser;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  me: boolean;
  userIds: string[];
  userLabels: string[];
};
