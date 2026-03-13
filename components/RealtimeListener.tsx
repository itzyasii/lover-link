"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";
import { resolveUserLabel } from "@/lib/users";
import { toast } from "@/stores/toast";
import { useTypingStore } from "@/stores/typing";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v == null) return null;
  return v as Record<string, unknown>;
}

function activeChatIdFromPath(pathname: string) {
  const match = pathname.match(/^\/app\/chat\/([^/]+)$/);
  return match?.[1] ?? null;
}

function previewMessage(message: Record<string, unknown>) {
  const type = typeof message.type === "string" ? message.type : "";
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const item = asRecord(message.item);
  const meta = asRecord(item?.meta);
  const kind = typeof item?.kind === "string" ? item.kind : "";

  if (type === "text" && text) return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  if (type === "share" && kind === "audio" && meta?.voiceNote === true) return "Sent a voice message";
  if (type === "share" && kind === "image") return "Sent a photo";
  if (type === "share" && kind === "video") return "Sent a video";
  if (type === "share" && kind === "audio") return "Sent an audio file";
  if (type === "share" && kind === "file") return "Sent a file";
  return "Sent you a message";
}

export function RealtimeListener() {
  const pathname = usePathname();
  const setTyping = useTypingStore((s) => s.setTyping);
  const clearTyping = useTypingStore((s) => s.clearTyping);
  const me = useAuthStore((s) => s.user);
  const activeChatId = useMemo(() => activeChatIdFromPath(pathname), [pathname]);
  const [unreadByChat, setUnreadByChat] = useState<Record<string, number>>({});
  const activeChatRef = useRef<string | null>(activeChatId);
  const defaultTitleRef = useRef("LoverLink");
  const blinkIntervalRef = useRef<number | null>(null);
  const blinkToggleRef = useRef(false);

  const totalUnread = useMemo(
    () => Object.values(unreadByChat).reduce((sum, count) => sum + count, 0),
    [unreadByChat],
  );

  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (totalUnread === 0) defaultTitleRef.current = document.title || "LoverLink";
  }, [pathname, totalUnread]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const unreadTitle =
      totalUnread > 0
        ? `(${totalUnread}) New Message${totalUnread === 1 ? "" : "s"}`
        : defaultTitleRef.current;

    if (blinkIntervalRef.current != null) {
      window.clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }

    if (totalUnread <= 0) {
      document.title = defaultTitleRef.current;
      return;
    }

    document.title = unreadTitle;
    blinkToggleRef.current = false;
    blinkIntervalRef.current = window.setInterval(() => {
      blinkToggleRef.current = !blinkToggleRef.current;
      document.title = blinkToggleRef.current
        ? unreadTitle
        : defaultTitleRef.current;
    }, 1000);

    return () => {
      if (blinkIntervalRef.current != null) {
        window.clearInterval(blinkIntervalRef.current);
        blinkIntervalRef.current = null;
      }
    };
  }, [totalUnread]);

  useEffect(() => {
    if (!activeChatId || typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    const timer = window.setTimeout(() => {
      setUnreadByChat((prev) => {
        if (!prev[activeChatId]) return prev;
        const next = { ...prev };
        delete next[activeChatId];
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeChatId]);

  useEffect(() => {
    const s = getSocket();
    if (!s.connected) s.connect();

    const isChatVisible = (chatId: string) =>
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      activeChatRef.current === chatId;

    const incrementUnread = (chatId: string) => {
      setUnreadByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? 0) + 1,
      }));
    };

    const notify = (title: string, message: string) => {
      toast({ title, message });
    };

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
      const chatId = typeof r.chatId === "string" ? r.chatId : "";
      if (!messageId || !from || from === me?.id) return;
      s.emit("chat:delivered", { messageIds: [messageId] });

      if (!chatId || isChatVisible(chatId)) return;

      incrementUnread(chatId);
      void resolveUserLabel(from).then((label) => {
        notify(label ?? "New message", previewMessage(message ?? {}));
      });
    };

    const onReaction = (p: unknown) => {
      const r = asRecord(p);
      if (!r) return;
      const chatId = typeof r.chatId === "string" ? r.chatId : "";
      const userId = r.userId == null ? "" : String(r.userId);
      const emoji = typeof r.emoji === "string" ? r.emoji : "";
      const action = r.action === "added" || r.action === "removed" ? r.action : "";
      if (!chatId || !userId || userId === me?.id || !emoji || action !== "added") return;
      if (isChatVisible(chatId)) return;
      void resolveUserLabel(userId).then((label) => {
        notify(label ?? "New reaction", `Reacted ${emoji} to your message`);
      });
    };

    const onVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible")
        return;
      const currentChatId = activeChatRef.current;
      if (!currentChatId) return;
      setUnreadByChat((prev) => {
        if (!prev[currentChatId]) return prev;
        const next = { ...prev };
        delete next[currentChatId];
        return next;
      });
    };

    s.on("chat:typing", onTyping);
    s.on("chat:message", onIncomingMessage);
    s.on("share:item", onIncomingMessage);
    s.on("chat:reaction", onReaction);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      s.off("chat:typing", onTyping);
      s.off("chat:message", onIncomingMessage);
      s.off("share:item", onIncomingMessage);
      s.off("chat:reaction", onReaction);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [setTyping, clearTyping, me?.id]);

  return null;
}

