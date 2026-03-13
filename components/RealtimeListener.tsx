"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useTypingStore } from "@/stores/typing";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

export function RealtimeListener() {
  const setTyping = useTypingStore((s) => s.setTyping);
  const clearTyping = useTypingStore((s) => s.clearTyping);

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

    s.on("chat:typing", onTyping);
    return () => {
      s.off("chat:typing", onTyping);
    };
  }, [setTyping, clearTyping]);

  return null;
}

