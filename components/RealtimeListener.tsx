"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { useTypingStore } from "@/stores/typing";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

export function RealtimeListener() {
  const setTyping = useTypingStore((s) => s.setTyping);
  const clearTyping = useTypingStore((s) => s.clearTyping);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    const onTyping = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const chatId = typeof r.chatId === "string" ? r.chatId : String(r.chatId ?? "");
      const from = typeof r.from === "string" ? r.from : String(r.from ?? "");
      const isTyping = Boolean(r.isTyping);
      if (!chatId || !from) return;
      if (isTyping) setTyping(chatId, from);
      else clearTyping(chatId);
    };

    const onIncomingMessage = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const message = asRecord(r.message);
      const messageId = typeof message?.id === "string" ? message.id : "";
      const from = message?.from == null ? "" : String(message.from);
      if (!messageId || !from || from === me?.id) return;
      s.emit("chat:delivered", { messageIds: [messageId] });
    };

    s.on("chat:typing", onTyping);
    s.on("chat:message", onIncomingMessage);
    s.on("share:item", onIncomingMessage);
    return () => {
      s.off("chat:typing", onTyping);
      s.off("chat:message", onIncomingMessage);
      s.off("share:item", onIncomingMessage);
    };
  }, [setTyping, clearTyping, me?.id]);

  return null;
}

