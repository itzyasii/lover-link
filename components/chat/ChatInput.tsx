import React, { useRef, useEffect } from "react";
import { Mic, Paperclip, Send, Square, LoaderCircle } from "lucide-react";
import { formatElapsed } from "@/lib/time";

interface ChatInputProps {
  text: string;
  setText: (v: string) => void;
  isRecordingVoice: boolean;
  isSendingVoice: boolean;
  voiceDurationMs: number;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  startVoiceRecording: () => void;
  stopVoiceRecording: () => void;
}

export function ChatInput({
  text,
  setText,
  isRecordingVoice,
  isSendingVoice,
  voiceDurationMs,
  onSend,
  onKeyDown,
  onInput,
  startVoiceRecording,
  stopVoiceRecording,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  return (
    <footer className="shrink-0 border-t border-black/5 bg-[#fbfbfe] px-4 py-3 pb-safe">
      <div className="relative mx-auto max-w-4xl">
        {isRecordingVoice || isSendingVoice ? (
          <div className="flex h-[52px] items-center justify-between gap-4 rounded-[26px] bg-white px-5 shadow-sm border border-black/5">
            {isSendingVoice ? (
              <>
                <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-(--accent-primary)" />
                <div className="grow text-center text-sm font-semibold text-gray-600">
                  Sending voice message...
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-500 text-white shadow-md active:scale-95 transition-transform"
                  onClick={stopVoiceRecording}
                >
                  <Square className="h-4 w-4" />
                </button>
                <div className="flex grow items-center justify-center gap-3">
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 [animation-duration:1.5s] shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  <div className="font-mono text-[15px] font-bold text-gray-700 tracking-wider">
                    {formatElapsed(voiceDurationMs)}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="relative flex items-end gap-2 bg-white rounded-[26px] shadow-sm border border-black/5 pl-4 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-(--accent-glow) focus-within:border-(--accent-primary) transition-all duration-200">
            <button
              type="button"
              className="focus-ring mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-black/5 hover:text-gray-600 transition-colors"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              className="max-h-[120px] min-h-[40px] w-full resize-none bg-transparent py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
              placeholder="Message..."
              value={text}
              onKeyDown={onKeyDown}
              onInput={onInput}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mb-0.5 shrink-0">
              {text.trim() ? (
                <button
                  type="button"
                  className="focus-ring flex h-[40px] w-[40px] items-center justify-center rounded-full bg-(--accent-primary) text-white shadow-md shadow-(--accent-glow) hover:scale-105 active:scale-95 transition-all"
                  onClick={onSend}
                >
                  <Send className="h-4 w-4 ml-0.5" />
                </button>
              ) : (
                <button
                  type="button"
                  className="focus-ring flex h-[40px] w-[40px] items-center justify-center rounded-full text-(--accent-primary) bg-(--accent-primary)/10 hover:bg-(--accent-primary)/20 active:scale-95 transition-all"
                  onClick={startVoiceRecording}
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
