import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

export class UploadHandler {
  private arduinoService: ArduinoCliService;

  constructor(arduinoService: ArduinoCliService) {
    this.arduinoService = arduinoService;
  }

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage,
    ) => void,
  ): Promise<void> {
    const { sketchPath, board, port } = message.payload;

    if (!sketchPath || !board || !port) {
      sendMessage(connection, {
        type: "error",
        action: "upload",
        data: {
          error: "Missing required parameters: sketchPath, board, and port",
        },
      });
      return;
    }

    logger.info(
      `Starting upload for ${sketchPath} to board ${board} on port ${port}`,
    );

    // Send status update
    sendMessage(connection, {
      type: "status",
      action: "upload",
      data: { message: "Starting upload...", sketchPath, board, port },
    });

    try {
      const result = await this.arduinoService.upload(
        sketchPath,
        board,
        port,
        (output: string) => {
          // Stream real-time output to client
          sendMessage(connection, {
            type: "output",
            action: "upload",
            data: { output },
          });
        },
      );

      if (result.success) {
        sendMessage(connection, {
          type: "complete",
          action: "upload",
          data: {
            success: true,
            message: "Upload completed successfully",
            sketchPath,
            board,
            port,
            output: result.output,
          },
        });
        logger.info(`Upload successful for ${sketchPath} to ${port}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "upload",
          data: {
            error: result.error || "Upload failed",
            output: result.output,
          },
        });
        logger.error(`Upload failed for ${sketchPath}:`, result.error);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "upload",
        data: { error: `Upload error: ${errorMessage}` },
      });
      logger.error(`Upload error for ${sketchPath}:`, error);
    }
  }
}
