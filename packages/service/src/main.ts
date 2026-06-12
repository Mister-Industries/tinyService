/**
 * Standalone entry point — runs TinyService as its own process (npm run dev /
 * npm start / packaged binaries). Embedders (e.g. the tinyStudio Electron app)
 * import { TinyService } from service.js instead.
 */
import { logger } from "./config.js";
import { TinyService } from "./service.js";

const service = new TinyService();

const shutdown = (signal: string): void => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  service
    .stop()
    .then(() => {
      logger.info("Service closed. Exiting process.");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error("Graceful shutdown timed out. Force exiting.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

service.start().catch((error) => {
  logger.error("Failed to start TinyService:", error);
  process.exit(1);
});
