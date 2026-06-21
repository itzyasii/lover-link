import { Msg, ReactionGroup, ShareItem } from "@/types/chat";
import { Check, Pencil, SmilePlus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import EmojiPicker from 'emoji-picker-react';

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
}) => {
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
                className="focus-ring w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-(--wine-900)"
                rows={3}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-black/5 text-(--wine-900) hover:bg-black/10"
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft("");
                  }}
                  title="Cancel"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  className="focus-ring grid h-9 w-9 place-items-center rounded-xl bg-(--rose-600) text-white hover:bg-(--rose-700)"
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
                  title="Save"
                  type="button"
                >
                  <Check className="h-4 w-4" />
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
                <a href={m.linkPreview.url} target="_blank" rel="noopener noreferrer" className={`block mt-3 rounded-lg overflow-hidden transition group ${mine ? 'bg-white/10 hover:bg-white/20 border border-white/20' : 'bg-black/5 hover:bg-black/10 border border-black/10'}`}>
                  {m.linkPreview.image && <img src={m.linkPreview.image} alt="Preview" className="w-full h-32 object-cover" />}
                  <div className="p-3">
                    {m.linkPreview.title && <div className="font-semibold text-sm line-clamp-1">{m.linkPreview.title}</div>}
                    {m.linkPreview.description && <div className="text-xs opacity-80 mt-1 line-clamp-2">{m.linkPreview.description}</div>}
                    <div className="text-[10px] opacity-60 mt-1 truncate">{m.linkPreview.url}</div>
                  </div>
                </a>
              )}
            </div>
          )}

          {reactionGroups.length ? (
            <div
              className={`mt-2 max-w-full rounded-xl px-2 py-1.5 ${
                mine ? "bg-white/15" : "bg-black/3"
              }`}
            >
              <div className="flex max-w-full flex-wrap gap-1">
                {reactionGroups.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition ${
                      r.me
                        ? mine
                          ? "bg-white/25 text-white"
                          : "bg-(--rose-600)/10 text-(--rose-700)"
                        : mine
                          ? "bg-white/15 text-white/85"
                          : "bg-white text-black/65"
                    }`}
                    onClick={() => emitReaction(m.id, r.emoji)}
                    title={formatReactionUsers(r.userLabels)}
                    aria-label={formatReactionUsers(r.userLabels)}
                  >
                    <span className="text-[13px] leading-none">{r.emoji}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={`mt-2 flex items-center gap-1.5 text-[11px] ${
              mine ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
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
              className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-(--wine-900)/65 hover:bg-black/5"
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
              <div className={`absolute top-10 z-50 shadow-lg ${mine ? "right-0" : "left-0"}`}>
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
