import React from "react";
import { CheckCheck, Check } from "lucide-react";

// Local definition of Msg type (simplified for UI rendering)
type Msg = {
  id: string;
  createdAt: string;
  type: "text" | "share" | "event";
  text?: string | null;
  item?: { originalName?: string } | null;
  reactions?: { emoji: string; userId: string; createdAt?: string }[];
  receipts?: { readAt?: string }[];
};

type Reaction = {
  emoji: string;
  userId: string;
  createdAt?: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
  };
};
type MessageBubbleProps = {
  message: Msg;
  isMe: boolean;
  showReadReceipt?: boolean;
  reactionUserLabels: Map<string, string>;
  onReact: (messageId: string, emoji: string) => void;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  showReadReceipt = false,
  reactionUserLabels,
  onReact,
}) => {
  const bubbleBase =
    "max-w-[80%] rounded-2xl p-3 text-sm break-words shadow-sm relative";
  const bubbleClass = isMe
    ? `${bubbleBase} ml-auto bg-rose-100 dark:bg-rose-900 text-black dark:text-white`
    : `${bubbleBase} mr-auto bg-sky-100 dark:bg-sky-900 text-black dark:text-white`;

  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mb-2">
      <div className={bubbleClass}>
        {message.type === "text" && message.text && (
          <p className="whitespace-pre-wrap">{message.text}</p>
        )}
        {message.type === "share" && message.item && (
          <div className="flex items-center space-x-2">
            {/* placeholder thumbnail */}
            <div className="w-10 h-10 bg-gray-200 rounded" />
            <span>{message.item?.originalName ?? "Attachment"}</span>
          </div>
        )}
        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((r: Reaction) => (
              <button
                key={r.userId + r.emoji}
                className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-0.5 text-xs"
                onClick={() => onReact(message.id, r.emoji)}
              >
                <span>{r.emoji}</span>
                <span className="ml-1 text-gray-600 dark:text-gray-300">
                  {reactionUserLabels.get(r.userId)}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="absolute right-2 bottom-1 text-gray-500 dark:text-gray-400 text-xs">
          {timestamp}
        </div>
        {/* Read receipt for own messages */}
        {isMe && showReadReceipt && (
          <div className="absolute left-2 bottom-1 flex items-center space-x-0.5">
            {message.receipts?.some((r) => r.readAt) ? (
              <CheckCheck className="w-3 h-3 text-green-600" />
            ) : (
              <Check className="w-3 h-3 text-gray-500" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
