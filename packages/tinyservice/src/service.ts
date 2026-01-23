import express from "express";
import { createServer } from "http";
import { config, logger } from "./config.js";
import { ArduinoCliService } from "./services/arduino-cli.service.js";
import { WebSocketService } from "./services/websocket.service.js";
import type { ServiceConfig } from "./types/messages.types.js";

export class TinyService {
  private app: express.Application;
  private config: ServiceConfig;
  private httpServer: any;
  private webSocketService: WebSocketService;
  private arduinoService: ArduinoCliService;

  constructor(userConfig?: Partial<ServiceConfig>) {
    // Merge user config with defaults from global config
    this.config = { ...config, ...userConfig };

    this.app = express();
    this.httpServer = createServer(this.app);
    this.arduinoService = new ArduinoCliService(this.config.arduinoCliPath);

    this.setupMiddleware();
    this.setupRoutes();
    this.webSocketService = new WebSocketService(
      this.httpServer,
      this.arduinoService,
    );
    this.setupGracefulShutdown();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
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
    this.app.get("/health", async (_req, res) => {
      try {
        const arduinoCliAvailable =
          await this.arduinoService.checkAvailability();
        const connectionCount = this.webSocketService.getConnectionCount();

        res.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          arduinoCli: {
            available: arduinoCliAvailable,
            path: this.config.arduinoCliPath,
          },
          webSocket: {
            connectionCount,
          },
          service: {
            port: this.config.port,
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
    this.app.get("/", (_req, res) => {
      res.json({
        name: "TinyService",
        version: "1.0.0",
        description:
          "WebSocket service for compiling and uploading Arduino projects",
        endpoints: {
          health: "/health",
          websocket: `ws://localhost:${this.config.port}`,
        },
        actions: ["compile", "upload", "verify", "list-boards"],
      });
    });

    // Catch-all for undefined routes
    this.app.use("*", (_req, res) => {
      res.status(404).json({
        error: "Not found",
        message: "The requested endpoint does not exist",
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      this.webSocketService.close();

      this.httpServer.close(() => {
        logger.info("Service closed. Exiting process.");
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.error("Graceful shutdown timed out. Force exiting.");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  public async start(): Promise<void> {
    try {
      // Check if Arduino CLI is available
      const arduinoCliAvailable = await this.arduinoService.checkAvailability();
      if (!arduinoCliAvailable) {
        logger.warn(
          "Arduino CLI is not available. Please ensure it is installed and accessible.",
        );
        logger.warn(
          `Configured Arduino CLI path: ${this.config.arduinoCliPath}`,
        );
      } else {
        logger.info("Arduino CLI is available and ready.");
      }

      this.httpServer.listen(this.config.port, () => {
        logger.info(`TinyService started on port ${this.config.port}`);
        logger.info(
          `Health check available at: http://localhost:${this.config.port}/health`,
        );
        logger.info(`WebSocket endpoint: ws://localhost:${this.config.port}`);
      });
    } catch (error) {
      logger.error("Failed to start service:", error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info("Stopping TinyService...");

        // Close WebSocket connections
        this.webSocketService.close();

        // Close HTTP server
        this.httpServer.close((err?: Error) => {
          if (err) {
            logger.error("Error closing HTTP server:", err);
            reject(err);
          } else {
            logger.info("TinyService stopped successfully");
            resolve();
          }
        });

        // Force close after 5 seconds if graceful shutdown fails
        setTimeout(() => {
          logger.warn("Forcefully closing TinyService after timeout");
          resolve();
        }, 5000);
      } catch (error) {
        logger.error("Error stopping TinyService:", error);
        reject(error);
      }
    });
  }
}
