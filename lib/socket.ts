import { io, Socket } from "socket.io-client";
import { env } from "./env";
import { useAuthStore } from "@/stores/auth";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@/types/realtime-events";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * Get a clean Socket.IO server URL.
 */
function getSocketUrl(): string {
  const configuredUrl = env.SOCKET_URL?.replace(/[`"']/g, "").trim();

  const url = configuredUrl || "https://api.loverlinkliveserver.dpdns.org";

  // Remove trailing slashes.
  // Socket.IO automatically handles the /socket.io path.
  return url.replace(/\/+$/, "");
}

/**
 * Get the latest authentication data from Zustand.
 *
 * Important:
 * We always read the current auth store instead of keeping
 * an old token inside this module.
 */
function getSocketAuth(): {
  accessToken: string;
  userId: string;
} | null {
  const { accessToken, user } = useAuthStore.getState();

  if (!accessToken || !user?.id) {
    return null;
  }

  return {
    accessToken,
    userId: user.id,
  };
}

/**
 * Create or return the singleton Socket.IO instance.
 *
 * IMPORTANT:
 * This function NEVER manually reconnects an existing socket.
 *
 * Socket.IO's own reconnection manager handles reconnecting.
 */
export function getSocket(): AppSocket {
  // Always return the existing singleton.
  //
  // DO NOT call socket.connect() here.
  //
  // The previous implementation was doing:
  //
  // if (!socket.connected) {
  //   socket.connect();
  // }
  //
  // That could fight with Socket.IO's internal reconnection
  // mechanism and cause repeated connection attempts.
  if (socket) {
    return socket;
  }

  const auth = getSocketAuth();

  if (!auth) {
    throw new Error(
      "Cannot initialize socket: Missing accessToken or userId. User must be authenticated.",
    );
  }

  const socketUrl = getSocketUrl();

  console.log("[Socket] Creating socket:", socketUrl);

  socket = io(socketUrl, {
    /**
     * Authentication sent during the Socket.IO handshake.
     */
    auth: {
      accessToken: auth.accessToken,
      userId: auth.userId,
    },

    /**
     * Automatically start the initial connection.
     */
    autoConnect: true,

    /**
     * Try WebSocket first, then fall back to polling.
     *
     * If your Cloudflare/Nginx setup does not support WebSocket
     * correctly, Socket.IO can still use polling.
     */
    transports: ["websocket", "polling"],

    /**
     * Let Socket.IO manage reconnection itself.
     */
    reconnection: true,

    /**
     * Keep retrying while the user remains authenticated.
     */
    reconnectionAttempts: Infinity,

    /**
     * Initial reconnect delay.
     */
    reconnectionDelay: 1000,

    /**
     * Maximum reconnect delay.
     */
    reconnectionDelayMax: 10000,

    /**
     * Randomize reconnect timing slightly to prevent
     * synchronized reconnect storms.
     */
    randomizationFactor: 0.5,

    /**
     * Maximum time allowed for one connection attempt.
     */
    timeout: 15000,

    /**
     * We are authenticating using Socket.IO auth,
     * not cookies.
     */
    withCredentials: false,
  });

  /**
   * Successful connection.
   */
  socket.on("connect", () => {
    console.log("[Socket] Connected successfully", {
      socketId: socket?.id,
      transport: socket?.io.engine?.transport?.name,
    });
  });

  /**
   * Connection closed.
   */
  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);

    /**
     * Socket.IO normally reconnects automatically after
     * temporary network failures.
     *
     * However, if the SERVER explicitly disconnects the client,
     * Socket.IO does not automatically reconnect.
     *
     * In that case, reconnect once.
     */
    if (reason === "io server disconnect") {
      const currentAuth = getSocketAuth();

      if (currentAuth && socket) {
        console.log("[Socket] Server disconnected client. Reconnecting...");

        socket.auth = {
          accessToken: currentAuth.accessToken,
          userId: currentAuth.userId,
        };

        socket.connect();
      }
    }
  });

  /**
   * Connection failed.
   */
  socket.on("connect_error", (error) => {
    console.warn("[Socket] Connection error:", error.message);

    console.log("[Socket] Connection details:", {
      socketUrl,
      envSocketUrl: env.SOCKET_URL,
      hasToken: !!auth.accessToken,
      userId: auth.userId,
      connected: socket?.connected,
      disconnected: socket?.disconnected,
      active: socket?.active,
      transport: socket?.io.engine?.transport?.name ?? "unknown",
    });

    /**
     * Do NOT manually call socket.connect() here.
     *
     * Socket.IO's reconnection manager handles it.
     */
  });

  /**
   * Reconnection attempt started.
   */
  socket.io.on("reconnect_attempt", (attempt) => {
    console.log(`[Socket] Reconnection attempt #${attempt}`);

    /**
     * Always use the latest token before reconnecting.
     *
     * This is important if the access token was refreshed
     * while the socket was disconnected.
     */
    const currentAuth = getSocketAuth();

    if (currentAuth && socket) {
      socket.auth = {
        accessToken: currentAuth.accessToken,
        userId: currentAuth.userId,
      };
    }
  });

  /**
   * Reconnected successfully.
   */
  socket.io.on("reconnect", (attempt) => {
    console.log(
      `[Socket] Reconnected successfully after ${attempt} attempt(s)`,
    );
  });

  /**
   * Reconnection failed permanently.
   *
   * With reconnectionAttempts: Infinity this should normally
   * never fire, but keeping the listener makes debugging easier.
   */
  socket.io.on("reconnect_failed", () => {
    console.error("[Socket] Reconnection failed.");
  });

  /**
   * Socket.IO manager error.
   */
  socket.io.on("error", (error) => {
    console.error("[Socket] Socket.IO manager error:", error);
  });

  return socket;
}

/**
 * Update the Socket.IO authentication token.
 *
 * Call this after refreshing the access token.
 */
export function updateSocketToken(newToken: string): void {
  const { user } = useAuthStore.getState();

  if (!user?.id) {
    console.warn("[Socket] Cannot update token: Missing user ID.");
    return;
  }

  const newAuth = {
    accessToken: newToken,
    userId: user.id,
  };

  /**
   * If the socket has not been created yet,
   * there is nothing to update.
   *
   * getSocket() will use the latest Zustand auth state
   * when it is eventually created.
   */
  if (!socket) {
    console.log("[Socket] Token updated. Socket has not been initialized yet.");

    return;
  }

  console.log("[Socket] Updating socket authentication token...");

  /**
   * Update handshake authentication.
   */
  socket.auth = newAuth;

  /**
   * If currently connected, force a fresh handshake
   * using the new token.
   */
  if (socket.connected) {
    console.log("[Socket] Reconnecting with refreshed token...");

    socket.disconnect();
    socket.connect();
  }
}

/**
 * Completely destroy the socket connection.
 *
 * Use this when:
 * - User logs out
 * - Auth session is permanently cleared
 * - You want to completely reset the socket
 */
export function disconnectSocket(): void {
  if (!socket) {
    return;
  }

  console.log("[Socket] Disconnecting socket...");

  /**
   * Disable automatic reconnection before manual disconnect.
   *
   * Otherwise Socket.IO may continue attempting to reconnect
   * after the user has logged out.
   */
  socket.io.opts.reconnection = false;

  /**
   * Close the current connection.
   */
  socket.disconnect();

  /**
   * Remove all listeners registered by this socket manager.
   */
  socket.removeAllListeners();

  /**
   * Remove manager listeners as well.
   */
  socket.io.removeAllListeners();

  /**
   * Destroy singleton reference.
   */
  socket = null;

  console.log("[Socket] Socket destroyed.");
}

/**
 * Debug current socket state.
 *
 * IMPORTANT:
 * This function does NOT force a reconnect.
 *
 * The previous implementation called socket.connect()
 * here, which could create another connection attempt while
 * Socket.IO was already reconnecting.
 */
export function debugSocketConnection(): void {
  if (!socket) {
    console.log("[Socket Debug] Socket instance does not exist.");

    return;
  }

  console.log("[Socket Debug] Current state:", {
    socketExists: true,
    socketId: socket.id,
    connected: socket.connected,
    disconnected: socket.disconnected,
    active: socket.active,
    socketUrl: getSocketUrl(),
    envSocketUrl: env.SOCKET_URL,
    transport: socket.io.engine?.transport?.name ?? "not connected",
    engineReadyState: socket.io.engine?.readyState ?? "not initialized",
  });
}

/**
 * Extract event parameters.
 */
type EventParameters<T> = T extends (...args: infer P) => unknown ? P : never;

/**
 * Extract the first event argument.
 *
 * Example:
 *
 * sendMessage: (data, callback) => void
 *
 * EventData<...> = data
 */
type EventData<T> =
  EventParameters<T> extends [infer First, ...unknown[]] ? First : never;

/**
 * Emit a Socket.IO event that expects an ACK response.
 *
 * IMPORTANT:
 * This function is intended ONLY for events whose backend
 * handler sends an acknowledgement callback.
 *
 * Example backend:
 *
 * socket.on("sendMessage", async (data, callback) => {
 *   callback({
 *     ok: true,
 *     data: message,
 *   });
 * });
 */
export function socketEmit<
  TEvent extends keyof ClientToServerEvents,
  TResponse = unknown,
>(
  event: TEvent,
  data?: EventData<ClientToServerEvents[TEvent]>,
): Promise<TResponse> {
  const auth = getSocketAuth();

  if (!auth) {
    return Promise.reject(
      new Error("Cannot emit socket event: User not authenticated."),
    );
  }

  const currentSocket = getSocket();

  return new Promise<TResponse>((resolve, reject) => {
    /**
     * Do not emit while disconnected.
     *
     * This prevents events from silently sitting in
     * the Socket.IO send buffer while the connection
     * is unavailable.
     */
    if (!currentSocket.connected) {
      reject(
        new Error(`Cannot emit "${String(event)}": Socket is not connected.`),
      );

      return;
    }

    let settled = false;

    /**
     * Prevent a request from hanging forever if the
     * backend never sends the ACK.
     */
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      reject(
        new Error(
          `Socket event "${String(
            event,
          )}" timed out waiting for server response.`,
        ),
      );
    }, 15000);

    /**
     * ACK callback from backend.
     */
    const callback = (response: {
      ok: boolean;
      data?: TResponse;
      error?: string;
    }) => {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeout);

      if (response?.ok) {
        resolve(response.data as TResponse);
      } else {
        reject(
          new Error(
            response?.error || `Socket event "${String(event)}" failed.`,
          ),
        );
      }
    };

    try {
      /**
       * The ClientToServerEvents type may contain different
       * ACK signatures, so the runtime call is intentionally
       * cast here.
       */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (currentSocket.emit as any)(event, data, callback);
    } catch (error) {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeout);

      reject(
        error instanceof Error
          ? error
          : new Error(`Failed to emit socket event "${String(event)}".`),
      );
    }
  });
}

/**
 * Emit a Socket.IO event without waiting for an ACK.
 *
 * Use this for events such as:
 *
 * - typing
 * - stopTyping
 * - userOnline
 * - callSignal
 *
 * ONLY use this if the backend event does not expect
 * an acknowledgement callback.
 */
export function socketEmitFireAndForget<
  TEvent extends keyof ClientToServerEvents,
>(event: TEvent, data?: EventData<ClientToServerEvents[TEvent]>): void {
  const auth = getSocketAuth();

  if (!auth) {
    console.warn(
      `[Socket] Cannot emit "${String(event)}": User not authenticated.`,
    );

    return;
  }

  const currentSocket = getSocket();

  if (!currentSocket.connected) {
    console.warn(
      `[Socket] Cannot emit "${String(event)}": Socket is not connected.`,
    );

    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (currentSocket.emit as any)(event, data);
  } catch (error) {
    console.error(`[Socket] Failed to emit "${String(event)}":`, error);
  }
}
