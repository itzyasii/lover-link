import { useQueryClient } from "@tanstack/react-query";
import { Msg, ReactionGroup, ShareItem } from "@/types/chat";
import { Check, Pencil, SmilePlus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import EmojiPicker from "emoji-picker-react";

interface MessageBubbleProps {
  m: Msg;
  mine: boolean;
  meId: string | undefined;
  chatId: string;
  otherUserId: string | null;
  otherDisplayName: string;
  editingId: string | null;
  editDraft: string;
  setEditingId: (id: string | null) => void;
  setEditDraft: (text: string) => void;
  openReactionFor: string | null;
  setOpenReactionFor: React.Dispatch<React.SetStateAction<string | null>>;
  emitReaction: (messageId: string, emoji: string) => void;
  reactionGroups: ReactionGroup[];
  reactionUserLabels: Map<string, string>;
  formatReactionUsers: (labels: string[]) => string;
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
  markVoiceListened: (messageId: string) => void;
  Attachment: React.FC<{
    message: Msg;
    onVoiceListened: (messageId: string) => void;
    meId: string | undefined;
    item: ShareItem | null;
  }>;
  ReceiptMark: React.FC<{ m: Msg; otherUserId: string | null }>;
  QUICK_REACTIONS: readonly string[];
  hideName?: boolean;
  isLast?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  m,
  mine,
  meId,
  chatId,
  otherUserId,
  otherDisplayName,
  editingId,
  editDraft,
  setEditingId,
  setEditDraft,
  openReactionFor,
  setOpenReactionFor,
  emitReaction,
  reactionGroups,
  formatReactionUsers,
  setMessages,
  markVoiceListened,
  Attachment,
  ReceiptMark,
  QUICK_REACTIONS,
  hideName,
  isLast,
}) => {
  const queryClient = useQueryClient();
  const reactionsOpen = openReactionFor === m.id;
  // 5-minute (300000ms) time threshold to disable edit/delete
  const EDIT_DELETE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const [canEditOrDelete, setCanEditOrDelete] = useState(false);

  useEffect(() => {
    const updateCanEdit = () => {
      const messageAge = Date.now() - new Date(m.createdAt).getTime();
      setCanEditOrDelete(messageAge < EDIT_DELETE_THRESHOLD_MS);
    };

    updateCanEdit();
    const interval = setInterval(updateCanEdit, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [m.createdAt, EDIT_DELETE_THRESHOLD_MS]);

  return (
    <div className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative flex max-w-[min(88%,42rem)] items-end gap-2 ${
          mine ? "flex-row-reverse" : ""
        }`}
      >
        <div
          className={`min-w-0 rounded-2xl border px-3 py-2 text-sm shadow-sm ${
            mine
              ? "rounded-br-md border-(--rose-600)/15 bg-(--rose-600) text-white"
              : "rounded-bl-md border-black/5 bg-white text-(--wine-900)"
          }`}
        >
          {!mine && !hideName ? (
            <div className="mb-1 text-xs font-medium text-black/45">
              {otherDisplayName}
            </div>
          ) : null}

          {m.deletedAt ? (
            <span
              className={mine ? "italic text-white/70" : "italic text-black/45"}
            >
              Message deleted
            </span>
          ) : editingId === m.id ? (
            <div className="grid gap-2">
              <textarea
                autoFocus
                className="w-full resize-none rounded-xl border border-white/20 bg-black/5 p-2 text-sm outline-none placeholder:text-white/50"
                rows={2}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const next = editDraft.trim();
                    if (!next) return;
                    void apiFetch(`/api/chats/${chatId}/messages/${m.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ text: next }),
                      trackLoading: false,
                    });
                    setMessages((prev) =>
                      prev.map((x) =>
                        x.id === m.id
                          ? {
                              ...x,
                              text: next,
                              editedAt: new Date().toISOString(),
                            }
                          : x,
                      ),
                    );
                    setEditingId(null);
                    setEditDraft("");
                  }
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditDraft("");
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-full bg-white/20 hover:bg-white/30"
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-full bg-white text-(--rose-600) hover:bg-white/90"
                  onClick={async () => {
                    const next = editDraft.trim();
                    if (!next) return;
                    await apiFetch(`/api/chats/${chatId}/messages/${m.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ text: next }),
                      trackLoading: false,
                    });
                    setMessages((prev) =>
                      prev.map((x) =>
                        x.id === m.id
                          ? {
                              ...x,
                              text: next,
                              editedAt: new Date().toISOString(),
                            }
                          : x,
                      ),
                    );
                    setEditingId(null);
                    setEditDraft("");
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : m.type === "share" && (m.item?.url || m.item?.legacyUrl) ? (
            <Attachment
              item={m.item}
              message={m}
              meId={meId}
              onVoiceListened={markVoiceListened}
            />
          ) : (
            <div className="whitespace-pre-wrap wrap-break-word leading-5">
              {m.text}
              {m.linkPreview && (
                <a
                  href={m.linkPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 block overflow-hidden rounded-xl border ${mine ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-black/10 bg-black/5 text-(--wine-900) hover:bg-black/10"} transition-colors`}
                >
                  {m.linkPreview.image && (
                    <img
                      src={m.linkPreview.image}
                      alt={m.linkPreview.title || "Link preview"}
                      className="h-32 w-full object-cover"
                    />
                  )}
                  <div className="p-3">
                    {m.linkPreview.title && (
                      <div className="font-semibold line-clamp-1">
                        {m.linkPreview.title}
                      </div>
                    )}
                    {m.linkPreview.description && (
                      <div className="mt-1 text-xs opacity-80 line-clamp-2">
                        {m.linkPreview.description}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
                      {new URL(m.linkPreview.url).hostname.replace(
                        /^www\./,
                        "",
                      )}
                    </div>
                  </div>
                </a>
              )}
            </div>
          )}

          {reactionGroups.length ? (
            <div
              className={`mt-2 inline-flex flex-wrap items-center gap-1 rounded-xl px-1 py-1 ${
                mine ? "bg-white/15" : "bg-black/3"
              }`}
            >
              <div className="flex max-w-full flex-wrap gap-1">
                {reactionGroups.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    className={`focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-colors ${
                      r.me
                        ? mine
                          ? "bg-white text-(--rose-600)"
                          : "bg-(--rose-100) text-(--rose-700)"
                        : mine
                          ? "hover:bg-white/20"
                          : "hover:bg-black/5"
                    }`}
                    onClick={() => emitReaction(m.id, r.emoji)}
                    title={formatReactionUsers(r.userLabels)}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-medium">{r.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide ${
              mine ? "text-white/60" : "text-black/35"
            }`}
          >
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {m.editedAt ? " • Edited" : ""}
            {mine ? (
              <span className="ml-1.5 inline-flex items-center">
                <ReceiptMark m={m} otherUserId={otherUserId} />
              </span>
            ) : null}
          </div>
        </div>

        {!m.deletedAt && editingId !== m.id ? (
          <div className="relative flex shrink-0 items-center gap-1 rounded-xl border border-black/5 bg-white p-1 opacity-100 shadow-sm md:opacity-0 md:transition md:group-hover:opacity-100">
            <button
              type="button"
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              onClick={() =>
                setOpenReactionFor((cur: string | null) =>
                  cur === m.id ? null : m.id,
                )
              }
              aria-label="Reactions"
              title="Reactions"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>

            {reactionsOpen && (
              <div
                className={`absolute z-50 shadow-lg ${isLast ? "bottom-[110%]" : "top-10"} ${mine ? "right-0" : "left-0"}`}
              >
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    emitReaction(m.id, emojiData.emoji);
                  }}
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled
                  lazyLoadEmojis
                  width={300}
                  height={350}
                />
              </div>
            )}

            {mine && canEditOrDelete ? (
              <>
                {m.type === "text" ? (
                  <button
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-(--wine-900)/65 hover:bg-black/5"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditDraft(m.text ?? "");
                    }}
                    type="button"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-(--wine-900)/65 hover:bg-black/5"
                  onClick={async () => {
                    await apiFetch(`/api/chats/${chatId}/messages/${m.id}`, {
                      method: "DELETE",
                      trackLoading: false,
                    });
                    setMessages((prev) =>
                      prev.map((x) =>
                        x.id === m.id
                          ? {
                              ...x,
                              text: null,
                              item: null,
                              reactions: [],
                              deletedAt: new Date().toISOString(),
                            }
                          : x,
                      ),
                    );
                    queryClient.invalidateQueries({ queryKey: ["chats"] });
                  }}
                  type="button"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
