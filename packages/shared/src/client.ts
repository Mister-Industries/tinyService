import { MessageFactory } from "./factory.js";
import type { IncomingMessage, OutgoingMessage } from "./types.js";
import { MessageValidator } from "./validator.js";

/**
 * Event handler types for the WebSocket client
 */
export type MessageHandler = (message: OutgoingMessage) => void;
export type ErrorHandler = (error: Error | string) => void;
export type ConnectionHandler = (event?: Event) => void;

/**
 * Configuration for WebSocket client
 */
export interface WebSocketClientConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoReconnect?: boolean;
  debug?: boolean;
}

/**
 * WebSocket client wrapper with type safety and automatic reconnection
 */
export class TinyServiceClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private isManualClose = false;

  constructor(config: WebSocketClientConfig) {
    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      autoReconnect: config.autoReconnect ?? true,
      debug: config.debug ?? false,
    };
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.log("Already connected");
      return;
    }

    try {
      this.isManualClose = false;
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);

      this.log("Connecting to:", this.config.url);
    } catch (error) {
      this.log("Connection error:", error);
      this.notifyError(error as Error);
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.isManualClose = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.log("Disconnected");
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send a message to the server
   */
  private send(message: IncomingMessage): void {
    if (!this.isConnected()) {
      throw new Error("WebSocket is not connected");
    }

    const validation = MessageValidator.validateIncoming(message);
    if (!validation.valid) {
      throw new Error(`Invalid message: ${validation.error}`);
    }

    this.ws!.send(JSON.stringify(message));
    this.log("Sent message:", message);
  }

  /**
   * Compile Arduino sketch
   */
  compile(sketchPath: string, board: string): void {
    this.send(MessageFactory.compile(sketchPath, board));
  }

  /**
   * Verify Arduino sketch (compile without upload)
   */
  verify(sketchPath: string, board: string): void {
    this.send(MessageFactory.verify(sketchPath, board));
  }

  /**
   * Upload Arduino sketch to board
   */
  upload(sketchPath: string, board: string, port: string): void {
    this.send(MessageFactory.upload(sketchPath, board, port));
  }

  /**
   * Request list of available boards
   */
  listBoards(): void {
    this.send(MessageFactory.listBoards());
  }

  /**
   * Request installation of tinyCore board cores
   */
  installCores(): void {
    this.send(MessageFactory.installCores());
  }

  /**
   * Search the Arduino library index
   */
  libSearch(query: string): void {
    this.send(MessageFactory.libSearch(query));
  }

  /**
   * List installed libraries
   */
  libList(): void {
    this.send(MessageFactory.libList());
  }

  /**
   * Install a library (optionally pinned to a version)
   */
  libInstall(library: string, version?: string): void {
    this.send(MessageFactory.libInstall(library, version));
  }

  /**
   * Uninstall a library
   */
  libUninstall(library: string): void {
    this.send(MessageFactory.libUninstall(library));
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Register a connect handler
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  /**
   * Register a disconnect handler
   */
  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(event: Event): void {
    this.log("Connected to server");
    this.reconnectAttempts = 0;
    this.connectHandlers.forEach((handler) => handler(event));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const result = MessageValidator.parseOutgoing(event.data);

      if (result.error) {
        this.log("Invalid message received:", result.error);
        this.notifyError(new Error(result.error));
        return;
      }

      if (result.message) {
        this.log("Received message:", result.message);
        this.messageHandlers.forEach((handler) => handler(result.message!));
      }
    } catch (error) {
      this.log("Error parsing message:", error);
      this.notifyError(error as Error);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    this.log("WebSocket error:", event);
    this.notifyError(new Error("WebSocket connection error"));
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    this.log("Connection closed:", event.code, event.reason);
    this.disconnectHandlers.forEach((handler) => handler(event));

    if (!this.isManualClose && this.config.autoReconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect to the server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log("Max reconnect attempts reached");
      this.notifyError(new Error("Max reconnect attempts reached"));
      return;
    }

    this.reconnectAttempts++;
    this.log(
      `Reconnecting in ${this.config.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.config.reconnectInterval);
  }

  /**
   * Notify all error handlers
   */
  private notifyError(error: Error | string): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }

  /**
   * Log debug messages
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log("[TinyServiceClient]", ...args);
    }
  }
}
