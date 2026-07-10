import express from "express";
import { createServer } from "http";
import { config, configure, logger } from "./config.js";
import { ArduinoCliService } from "./services/arduino-cli.service.js";
import { WebSocketService } from "./services/websocket.service.js";
import type { ServiceConfig } from "./types/messages.types.js";

export class TinyService {
  private app: express.Application;
  private httpServer: any;
  private webSocketService: WebSocketService;
  private arduinoService: ArduinoCliService;

  constructor(options?: Partial<ServiceConfig>) {
    if (options) {
      configure(options);
    }

    this.app = express();
    this.httpServer = createServer(this.app);
    this.arduinoService = new ArduinoCliService();

    this.setupMiddleware();
    this.setupRoutes();
    this.webSocketService = new WebSocketService(this.httpServer);
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
      );

      if (req.method === "OPTIONS") {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", async (req, res) => {
      try {
        const arduinoCliAvailable =
          await this.arduinoService.checkAvailability();
        const connectionCount = this.webSocketService.getConnectionCount();

        res.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          arduinoCli: {
            available: arduinoCliAvailable,
            path: config.arduinoCliPath,
          },
          webSocket: {
            connectionCount,
          },
          lsp: {
            available: this.webSocketService.isLspAvailable(),
          },
          service: {
            port: config.port,
            uptime: process.uptime(),
          },
        });
      } catch (error) {
        logger.error("Health check failed:", error);
        res.status(500).json({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // API info endpoint
    this.app.get("/", (req, res) => {
      res.json({
        name: "TinyService",
        version: "1.0.0",
        description:
          "WebSocket service for compiling and uploading Arduino projects",
        endpoints: {
          health: "/health",
          websocket: `ws://localhost:${config.port}`,
        },
        actions: ["compile", "upload", "verify", "list-boards"],
      });
    });

    // Catch-all for undefined routes
    this.app.use("*", (req, res) => {
      res.status(404).json({
        error: "Not found",
        message: "The requested endpoint does not exist",
      });
    });
  }

  public async start(): Promise<void> {
    // Check if Arduino CLI is available
    const arduinoCliAvailable = await this.arduinoService.checkAvailability();
    if (!arduinoCliAvailable) {
      logger.warn(
        "Arduino CLI is not available. Please ensure it is installed and accessible."
      );
      logger.warn(`Configured Arduino CLI path: ${config.arduinoCliPath}`);
    } else {
      logger.info("Arduino CLI is available and ready.");
    }

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(config.port, () => {
        this.httpServer.removeListener("error", reject);
        logger.info(`TinyService started on port ${config.port}`);
        logger.info(
          `Health check available at: http://localhost:${config.port}/health`
        );
        logger.info(`WebSocket endpoint: ws://localhost:${config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the service gracefully: close WebSocket connections and the HTTP
   * server. Does NOT exit the process — embedders own the process lifecycle.
   */
  public async stop(): Promise<void> {
    this.webSocketService.close();

    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    logger.info("TinyService stopped.");
  }
}

export default TinyService;
