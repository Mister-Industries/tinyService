import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * board-details: fetch a board's FQBN config options (the Arduino IDE
 * "Tools menu" equivalents — PSRAM, CPU frequency, partition scheme, …) and
 * available programmers, via `arduino-cli board details -b <fqbn>`.
 */
export class BoardDetailsHandler {
  private arduinoService = new ArduinoCliService();

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage
    ) => void
  ): Promise<void> {
    const fqbn = message.payload.board;
    try {
      const details = await this.arduinoService.boardDetails(fqbn);
      if (!details) {
        sendMessage(connection, {
          type: "error",
          action: "board-details",
          data: { error: `Could not fetch board details for ${fqbn}` },
        });
        return;
      }
      sendMessage(connection, {
        type: "complete",
        action: "board-details",
        data: { success: true, message: "ok", details },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`board-details failed for ${fqbn}:`, error);
      sendMessage(connection, {
        type: "error",
        action: "board-details",
        data: { error: `board-details failed: ${errorMessage}` },
      });
    }
  }
}
