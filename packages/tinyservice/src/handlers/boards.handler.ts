import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

export class BoardsHandler {
  private arduinoService: ArduinoCliService;

  constructor() {
    this.arduinoService = new ArduinoCliService();
  }

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage,
    ) => void,
  ): Promise<void> {
    logger.info("Listing connected boards");

    // Send status update
    sendMessage(connection, {
      type: "status",
      action: "list-boards",
      data: { message: "Scanning for connected boards..." },
    });

    try {
      const boards = await this.arduinoService.listBoards();

      sendMessage(connection, {
        type: "complete",
        action: "list-boards",
        data: {
          message: `Found ${boards.length} connected board(s)`,
          boards,
        },
      });

      logger.info(`Found ${boards.length} connected boards`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "list-boards",
        data: { error: `Error listing boards: ${errorMessage}` },
      });
      logger.error("Error listing boards:", error);
    }
  }
}
