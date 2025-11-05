import { logger } from "./services/logging.service.js";
import type { ServiceConfig } from "./types/messages.types.js";

export const config: ServiceConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  arduinoCliPath: process.env.ARDUINO_CLI_PATH || "arduino-cli",
  allowedOrigins: ["http://localhost:3000", "ws://localhost:3000"],
};

export { logger };
