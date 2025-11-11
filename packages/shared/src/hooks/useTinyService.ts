import { useCallback, useEffect, useRef, useState } from "react";
import { TinyServiceClient } from "../client.js";
import type { OutgoingMessage } from "../types.js";

export interface UseTinyServiceOptions {
  url: string;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  debug?: boolean;
}

export interface UseTinyServiceReturn {
  client: TinyServiceClient | null;
  connected: boolean;
  messages: OutgoingMessage[];
  error: Error | string | null;
  connect: () => void;
  disconnect: () => void;
  compile: (sketchPath: string, board: string) => void;
  upload: (sketchPath: string, board: string, port: string) => void;
  verify: (sketchPath: string, board: string) => void;
  listBoards: () => void;
  clearMessages: () => void;
}

/**
 * React hook for managing TinyService WebSocket client
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { connected, messages, compile, upload } = useTinyService({
 *     url: 'ws://localhost:8080',
 *     autoConnect: true,
 *     debug: true
 *   });
 *
 *   return (
 *     <div>
 *       <p>Status: {connected ? 'Connected' : 'Disconnected'}</p>
 *       <button onClick={() => compile('/path/to/sketch', 'arduino:avr:uno')}>
 *         Compile
 *       </button>
 *       <div>
 *         {messages.map((msg, i) => (
 *           <div key={i}>{msg.type}: {JSON.stringify(msg.data)}</div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTinyService(
  options: UseTinyServiceOptions,
): UseTinyServiceReturn {
  const {
    url,
    autoConnect = true,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectInterval = 3000,
    debug = false,
  } = options;

  const [client, setClient] = useState<TinyServiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<OutgoingMessage[]>([]);
  const [error, setError] = useState<Error | string | null>(null);

  // Use ref to track if component is mounted
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Initialize client
  useEffect(() => {
    const wsClient = new TinyServiceClient({
      url,
      autoReconnect,
      maxReconnectAttempts,
      reconnectInterval,
      debug,
    });

    // Set up event handlers
    wsClient.onConnect(() => {
      if (isMounted.current) {
        setConnected(true);
        setError(null);
      }
    });

    wsClient.onDisconnect(() => {
      if (isMounted.current) {
        setConnected(false);
      }
    });

    wsClient.onMessage((message) => {
      if (isMounted.current) {
        setMessages((prev) => [...prev, message]);
      }
    });

    wsClient.onError((err) => {
      if (isMounted.current) {
        setError(err);
      }
    });

    setClient(wsClient);

    // Auto-connect if enabled
    if (autoConnect) {
      wsClient.connect();
    }

    // Cleanup on unmount
    return () => {
      wsClient.disconnect();
    };
  }, [
    url,
    autoReconnect,
    maxReconnectAttempts,
    reconnectInterval,
    debug,
    autoConnect,
  ]);

  // Connect method
  const connect = useCallback(() => {
    if (client) {
      client.connect();
    }
  }, [client]);

  // Disconnect method
  const disconnect = useCallback(() => {
    if (client) {
      client.disconnect();
    }
  }, [client]);

  // Compile method
  const compile = useCallback(
    (sketchPath: string, board: string) => {
      if (client && connected) {
        client.compile(sketchPath, board);
      } else {
        setError("Not connected to server");
      }
    },
    [client, connected],
  );

  // Upload method
  const upload = useCallback(
    (sketchPath: string, board: string, port: string) => {
      if (client && connected) {
        client.upload(sketchPath, board, port);
      } else {
        setError("Not connected to server");
      }
    },
    [client, connected],
  );

  // Verify method
  const verify = useCallback(
    (sketchPath: string, board: string) => {
      if (client && connected) {
        client.verify(sketchPath, board);
      } else {
        setError("Not connected to server");
      }
    },
    [client, connected],
  );

  // List boards method
  const listBoards = useCallback(() => {
    if (client && connected) {
      client.listBoards();
    } else {
      setError("Not connected to server");
    }
  }, [client, connected]);

  // Clear messages method
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    client,
    connected,
    messages,
    error,
    connect,
    disconnect,
    compile,
    upload,
    verify,
    listBoards,
    clearMessages,
  };
}
