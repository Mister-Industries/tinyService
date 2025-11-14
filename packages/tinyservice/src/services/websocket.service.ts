import type {
  IncomingMessage,
  OutgoingMessage,
} from "@mister-industries/shared";
import { MessageValidator } from "@mister-industries/shared";
import { v4 as uuidv4 } from "uuid";
import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../config.js";
import { BoardsHandler } from "../handlers/boards.handler.js";
import { CompileHandler } from "../handlers/compile.handler.js";
import { handleInstallCores } from "../handlers/install-cores.handler.js";
import { UploadHandler } from "../handlers/upload.handler.js";
import { ArduinoCliService } from "./arduino-cli.service.js";

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
  private arduinoService: ArduinoCliService;

  constructor(server: any) {
    this.wss = new WebSocketServer({
      server,
      verifyClient: (_info: { origin: string; secure: boolean; req: any }) => {
        // Basic origin verification - can be enhanced based on requirements
        return true;
      },
    });

    this.compileHandler = new CompileHandler();
    this.uploadHandler = new UploadHandler();
    this.boardsHandler = new BoardsHandler();
    this.arduinoService = new ArduinoCliService();

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

      connection.on("message", async (data: WebSocket.Data) => {
        try {
          const result = MessageValidator.parseIncoming(data.toString());
          if (result.error) {
            logger.error(
              `Invalid message from ${connection.id}: ${result.error}`,
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
            "Invalid message format",
          );
        }
      });

      connection.on("pong", () => {
        connection.isAlive = true;
      });

      connection.on("close", () => {
        logger.info(`WebSocket connection closed: ${connection.id}`);
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
    message: IncomingMessage,
  ): Promise<void> {
    logger.debug(`Received message from ${connection.id}:`, message);

    try {
      switch (message.action) {
        case "compile":
          await this.compileHandler.handle(
            connection,
            message,
            this.sendMessage.bind(this),
          );
          break;

        case "upload":
          await this.uploadHandler.handle(
            connection,
            message,
            this.sendMessage.bind(this),
          );
          break;

        case "verify":
          await this.compileHandler.handleVerify(
            connection,
            message,
            this.sendMessage.bind(this),
          );
          break;

        case "list-boards":
          await this.boardsHandler.handle(
            connection,
            message,
            this.sendMessage.bind(this),
          );
          break;

        case "install-cores":
          await handleInstallCores(connection, this.arduinoService);
          break;

        default:
          this.sendError(
            connection,
            message.action,
            `Unknown action: ${message.action}`,
          );
      }
    } catch (error) {
      logger.error(
        `Error handling message ${message.action} from ${connection.id}:`,
        error,
      );
      this.sendError(connection, message.action, "Internal server error");
    }
  }

  private sendMessage(
    connection: WebSocketConnection,
    message: OutgoingMessage,
  ): void {
    if (connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    }
  }

  private sendError(
    connection: WebSocketConnection,
    action: string,
    error: string,
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

  public close(): void {
    this.wss.close();
  }
}
