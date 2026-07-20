import { io, Socket } from "socket.io-client";
import { env } from "./env";
import { useAuthStore } from "@/stores/auth";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@/types/realtime-events";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  if (!socket) {
    const { accessToken, user } = useAuthStore.getState();

    // Only create socket if we have valid authentication credentials
    if (!accessToken || !user?.id) {
      throw new Error(
        "Cannot initialize socket: Missing valid accessToken or userId. User must be authenticated.",
      );
    }

    socket = io(env.SOCKET_URL, {
      auth: {
        accessToken: accessToken,
        userId: user.id,
      },
      autoConnect: true,
      // The API endpoint supports WebSocket upgrades. Avoid XHR polling, which
      // can fail in the browser even when the backend is reachable.
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;

    socket.on("connect", () => {
      console.log("[Socket] Connected successfully");
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.warn("[Socket] Connection attempt failed:", error.message);
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

// Create a type that extracts the first parameter type from each ClientToServerEvents function
type EventParameters<T> = T extends (...args: infer P) => unknown ? P : never;
type EventData<T> = EventParameters<T>[0];

export function socketEmit<
  TEvent extends keyof ClientToServerEvents,
  TResponse = unknown,
>(
  event: TEvent,
  data?: EventData<ClientToServerEvents[TEvent]>,
): Promise<TResponse> {
  const { accessToken, user } = useAuthStore.getState();
  if (!accessToken || !user?.id) {
    return Promise.reject(
      new Error("Cannot emit socket event: User not authenticated"),
    );
  }

  const currentSocket = getSocket();
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (currentSocket.emit as any)(
      event,
      data,
      (response: { ok: boolean; data?: TResponse; error?: string }) => {
        if (response.ok && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || "Socket event failed"));
        }
      },
    );
  });
}
