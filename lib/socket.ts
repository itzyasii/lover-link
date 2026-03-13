"use client";

import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";

let socket: Socket | null = null;
let unsubAuth: (() => void) | null = null;
let lastToken: string | null = null;

function updateAuthAndConnection(nextToken: string | null) {
  if (!socket) return;
  socket.auth = nextToken ? { accessToken: nextToken } : {};
  if (nextToken) {
    // Socket.IO auth is evaluated during the handshake; when the token changes
    // (e.g. refresh flow), force a reconnect to re-auth with the new token.
    if (socket.connected && lastToken && lastToken !== nextToken) {
      socket.disconnect();
    }
    if (!socket.connected) socket.connect();
  } else {
    if (socket.connected) socket.disconnect();
  }
  lastToken = nextToken;
}

export function getSocket() {
  const token = useAuthStore.getState().accessToken;

  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: token ? { accessToken: token } : undefined,
      withCredentials: true,
      autoConnect: false,
    });

    if (!unsubAuth) {
      unsubAuth = useAuthStore.subscribe((state, prev) => {
        if (state.accessToken === prev.accessToken) return;
        updateAuthAndConnection(state.accessToken);
      });
    }
  } else {
    updateAuthAndConnection(token);
  }

  if (token) updateAuthAndConnection(token);

  return socket;
}

