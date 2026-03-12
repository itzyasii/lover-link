"use client";

import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "@/lib/env";
import { useAuthStore } from "@/stores/auth";

let socket: Socket | null = null;

export function getSocket() {
  const token = useAuthStore.getState().accessToken;

  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: token ? { accessToken: token } : undefined,
      withCredentials: true,
      autoConnect: Boolean(token),
    });
  } else {
    socket.auth = token ? { accessToken: token } : {};
    if (token && !socket.connected) socket.connect();
  }

  return socket;
}

