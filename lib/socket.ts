import { io, Socket } from "socket.io-client";
import { env } from "./env";
import { useAuthStore } from "@/stores/auth";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const { accessToken, user } = useAuthStore.getState();

    // Only create socket if we have valid authentication credentials
    if (!accessToken || !user?.id) {
      throw new Error(
        "Cannot initialize socket: Missing valid accessToken or userId. User must be authenticated.",
      );
    }

    socket = io(env.API_BASE_URL, {
      auth: {
        accessToken: accessToken,
        userId: user.id,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected successfully");
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error);
      if (error.message.includes("invalid access token")) {
        console.log("[Socket] Invalid token, attempting re-authentication");
      }
    });

    return socket;
  }
  return socket;
}

export function updateSocketToken(newToken: string) {
  if (socket) {
    const { user } = useAuthStore.getState();
    if (user?.id) {
      socket.auth = {
        accessToken: newToken,
        userId: user.id,
      };
      socket.connect();
    }
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function socketEmit<T = unknown>(
  event: string,
  data?: unknown,
): Promise<T> {
  const { accessToken, user } = useAuthStore.getState();
  if (!accessToken || !user?.id) {
    return Promise.reject(
      new Error("Cannot emit socket event: User not authenticated"),
    );
  }

  const currentSocket = getSocket();
  return new Promise((resolve, reject) => {
    currentSocket.emit(
      event,
      data,
      (response: { ok: boolean; data?: T; error?: string }) => {
        if (response.ok && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || "Socket event failed"));
        }
      },
    );
  });
}
