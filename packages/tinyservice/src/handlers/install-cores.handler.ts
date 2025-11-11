import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import { WebSocketConnection } from "../types/messages.types.js";

export async function handleInstallCores(
  ws: WebSocketConnection,
  arduinoService: ArduinoCliService,
): Promise<void> {
  logger.info("Processing install-cores request");

  // Send initial status
  ws.send(
    JSON.stringify({
      type: "status",
      action: "install-cores",
      data: {
        message: "Checking board core installation...",
      },
    }),
  );

  try {
    // Initialize tinyCore boards with output streaming
    const success = await arduinoService.initializeTinyCoreBoards((output) => {
      ws.send(
        JSON.stringify({
          type: "output",
          action: "install-cores",
          data: {
            output: output,
          },
        }),
      );
    });

    if (success) {
      ws.send(
        JSON.stringify({
          type: "complete",
          action: "install-cores",
          data: {
            success: true,
            message: "Board cores installed and ready",
          },
        }),
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          action: "install-cores",
          data: {
            error: "Failed to install board cores",
            details: "Check output for more information",
          },
        }),
      );
    }
  } catch (error) {
    logger.error("Error installing cores:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        action: "install-cores",
        data: {
          error: "Failed to install board cores",
          details: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }
}
