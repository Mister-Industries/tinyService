import type { IncomingMessage, OutgoingMessage } from "@mister-industries/shared";
import { MessageValidator } from "@mister-industries/shared";
import { v4 as uuidv4 } from "uuid";
import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../config.js";
import { BoardDetailsHandler } from "../handlers/board-details.handler.js";
import { BoardManagerHandler } from "../handlers/board-manager.handler.js";
import { BoardsHandler } from "../handlers/boards.handler.js";
import { CompileHandler } from "../handlers/compile.handler.js";
import { handleInstallCores } from "../handlers/install-cores.handler.js";
import { LibraryHandler } from "../handlers/library.handler.js";
import { SerialHandler } from "../handlers/serial.handler.js";
import { UploadHandler } from "../handlers/upload.handler.js";
import { ArduinoCliService } from "./arduino-cli.service.js";
import { BoardWatchService } from "./board-watch.service.js";
import { LspService } from "./lsp.service.js";

export interface WebSocketConnection extends WebSocket {
  id: string;
  isAlive: boolean;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private connections: Map<string, WebSocketConnection> = new Map();
  private compileHandler: CompileHandler;
  private uploadHandler: UploadHandler;
  private boardsHandler: BoardsHandler;
  private libraryHandler: LibraryHandler;
  private boardManagerHandler: BoardManagerHandler;
  private serialHandler: SerialHandler;
  private boardDetailsHandler: BoardDetailsHandler;
  private arduinoService: ArduinoCliService;
  private boardWatch: BoardWatchService;
  private lspService: LspService;

  constructor(server: any) {
    // noServer mode: we route HTTP upgrades ourselves so the same HTTP server
    // can host both the main message socket (any path) and the LSP bridge
    // (/lsp). Two WebSocketServers attached via `{ server }` would fight over
    // the 'upgrade' event.
    this.wss = new WebSocketServer({ noServer: true });
    this.lspService = new LspService();

    server.on(
      "upgrade",
      (request: any, socket: import("stream").Duplex, head: Buffer) => {
        let pathname = "/";
        try {
          pathname = new URL(request.url || "/", "http://localhost").pathname;
        } catch {
          /* keep default */
        }
        if (pathname === "/lsp") {
          this.lspService.handleUpgrade(request, socket, head);
        } else {
          this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            this.wss.emit("connection", ws, request);
          });
        }
      }
    );

    this.compileHandler = new CompileHandler();
    this.uploadHandler = new UploadHandler();
    this.boardsHandler = new BoardsHandler();
    this.libraryHandler = new LibraryHandler();
    this.boardManagerHandler = new BoardManagerHandler();
    this.serialHandler = new SerialHandler();
    this.boardDetailsHandler = new BoardDetailsHandler();
    this.arduinoService = new ArduinoCliService();

    // Event-driven board detection: one long-lived `board list --watch`
    // process pushes add/remove events; every change is broadcast to all
    // connected clients so plug/unplug shows up without polling.
    this.boardWatch = new BoardWatchService();
    this.boardWatch.onChange((boards) => {
      this.broadcast({
        type: "status",
        action: "board-events",
        data: { boards },
      });
    });
    this.boardWatch.start();

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      const connection = ws as WebSocketConnection;
      connection.id = uuidv4();
      connection.isAlive = true;

      this.connections.set(connection.id, connection);
      logger.info(`New WebSocket connection: ${connection.id}`);

      // Send welcome message
      this.sendMessage(connection, {
        type: "status",
        action: "connect",
        data: {
          message: "Connected to Arduino WebSocket Service",
          connectionId: connection.id,
        },
      });

      // Send the current board snapshot immediately so a (re)connecting
      // client doesn't have to wait for the next hardware event or ask.
      if (this.boardWatch.isRunning()) {
        this.sendMessage(connection, {
          type: "status",
          action: "board-events",
          data: { boards: this.boardWatch.getBoards() },
        });
      }

      connection.on("message", async (data: WebSocket.Data) => {
        try {
          const result = MessageValidator.parseIncoming(data.toString());
          if (result.error) {
            logger.error(
              `Invalid message from ${connection.id}: ${result.error}`
            );
            this.sendError(connection, "invalid-message", result.error);
            return;
          }
          if (result.message) {
            await this.handleMessage(connection, result.message);
          }
        } catch (error) {
          logger.error(`Error parsing message from ${connection.id}:`, error);
          this.sendError(
            connection,
            "invalid-message",
            "Invalid message format"
          );
        }
      });

      connection.on("pong", () => {
        connection.isAlive = true;
      });

      connection.on("close", () => {
        logger.info(`WebSocket connection closed: ${connection.id}`);
        this.serialHandler.close(connection.id);
        this.connections.delete(connection.id);
      });

      connection.on("error", (error: Error) => {
        logger.error(`WebSocket error for ${connection.id}:`, error);
        this.connections.delete(connection.id);
      });
    });

    this.wss.on("error", (error: Error) => {
      logger.error("WebSocket server error:", error);
    });
  }

  private async handleMessage(
    connection: WebSocketConnection,
    message: IncomingMessage
  ): Promise<void> {
    logger.debug(`Received message from ${connection.id}:`, message);

    // Echo the request id (when present) on every reply so clients can
    // correlate concurrent requests instead of matching by action name alone.
    const requestId = message.id;
    const send = (
      conn: WebSocketConnection,
      outgoing: OutgoingMessage
    ): void => {
      this.sendMessage(
        conn,
        requestId !== undefined && outgoing.id === undefined
          ? { ...outgoing, id: requestId }
          : outgoing
      );
    };

    try {
      switch (message.action) {
        case "compile":
          await this.compileHandler.handle(connection, message, send);
          break;

        case "upload":
          // The serial monitor holds the port exclusively; release it (and wait
          // for the process to actually die) so the upload can open the port,
          // then tell the client it closed. This close notice is a push, not a
          // reply to the upload request — send it without the request id.
          await this.serialHandler.close(connection.id);
          this.sendMessage(connection, {
            type: "complete",
            action: "serial",
            data: { success: true, message: "closed", closed: true },
          });
          await this.uploadHandler.handle(connection, message, send);
          break;

        case "verify":
          await this.compileHandler.handleVerify(connection, message, send);
          break;

        case "list-boards":
          // Serve from the watcher's in-memory state when it's healthy: the
          // reply is instant and spawns no CLI process. Falls back to a
          // one-shot `board list` scan if the watcher is down.
          if (this.boardWatch.isRunning()) {
            const boards = this.boardWatch.getBoards();
            send(connection, {
              type: "complete",
              action: "list-boards",
              data: {
                message: `Found ${boards.length} connected board(s)`,
                boards,
              },
            });
          } else {
            await this.boardsHandler.handle(connection, message, send);
          }
          break;

        case "board-details":
          await this.boardDetailsHandler.handle(connection, message, send);
          break;

        case "install-cores":
          await handleInstallCores(connection, this.arduinoService);
          break;

        case "lib-search":
        case "lib-list":
        case "lib-install":
        case "lib-uninstall":
          await this.libraryHandler.handle(connection, message, send);
          break;

        case "core-search":
        case "core-list":
        case "core-install":
        case "core-uninstall":
        case "board-listall":
        case "board-url-list":
        case "board-url-add":
        case "board-url-remove":
          await this.boardManagerHandler.handle(connection, message, send);
          break;

        case "serial-open":
        case "serial-close":
        case "serial-write":
          // Serial messages are a live stream, not request/response — the
          // handler sends with the raw sender so stream output isn't tagged
          // with a stale request id.
          await this.serialHandler.handle(
            connection,
            message,
            this.sendMessage.bind(this)
          );
          break;

        default:
          this.sendError(
            connection,
            message.action,
            `Unknown action: ${message.action}`
          );
      }
    } catch (error) {
      logger.error(
        `Error handling message ${message.action} from ${connection.id}:`,
        error
      );
      this.sendError(connection, message.action, "Internal server error");
    }
  }

  private sendMessage(
    connection: WebSocketConnection,
    message: OutgoingMessage
  ): void {
    if (connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    }
  }

  private sendError(
    connection: WebSocketConnection,
    action: string,
    error: string
  ): void {
    this.sendMessage(connection, {
      type: "error",
      action,
      data: { error },
    });
  }

  private startHeartbeat(): void {
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const connection = ws as WebSocketConnection;
        if (!connection.isAlive) {
          logger.info(`Terminating inactive connection: ${connection.id}`);
          connection.terminate();
          this.connections.delete(connection.id);
          return;
        }

        connection.isAlive = false;
        connection.ping();
      });
    }, 30000); // 30 seconds

    this.wss.on("close", () => {
      clearInterval(interval);
    });
  }

  public broadcast(message: OutgoingMessage): void {
    this.connections.forEach((connection) => {
      this.sendMessage(connection, message);
    });
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  /** Whether the /lsp bridge can actually serve (binaries present). */
  public isLspAvailable(): boolean {
    return this.lspService.isAvailable();
  }

  public close(): void {
    this.boardWatch.stop();
    this.lspService.close();
    this.wss.close();
  }
}
