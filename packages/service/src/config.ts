import { logger } from "./services/logging.service.js";
import type { ServiceConfig } from "./types/messages.types.js";

export const config: ServiceConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  arduinoCliPath: process.env.ARDUINO_CLI_PATH || "arduino-cli",
  allowedOrigins: ["http://localhost:3000", "ws://localhost:3000"],
};

/**
 * Override service configuration at runtime (used by embedders such as the
 * tinyStudio Electron app, which passes port/arduinoCliPath/allowedOrigins).
 * Must be called before the service constructs its Arduino/WebSocket services.
 */
export function configure(overrides: Partial<ServiceConfig>): void {
  if (overrides.port !== undefined) config.port = overrides.port;
  if (overrides.arduinoCliPath !== undefined) config.arduinoCliPath = overrides.arduinoCliPath;
  if (overrides.allowedOrigins !== undefined) config.allowedOrigins = overrides.allowedOrigins;
}

export { logger };
