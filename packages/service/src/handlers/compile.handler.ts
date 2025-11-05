import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

export class CompileHandler {
  private arduinoService: ArduinoCliService;

  constructor() {
    this.arduinoService = new ArduinoCliService();
  }

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage
    ) => void
  ): Promise<void> {
    const { sketchPath, board } = message.payload;

    if (!sketchPath || !board) {
      sendMessage(connection, {
        type: "error",
        action: "compile",
        data: { error: "Missing required parameters: sketchPath and board" },
      });
      return;
    }

    logger.info(`Starting compilation for ${sketchPath} with board ${board}`);

    // Send status update
    sendMessage(connection, {
      type: "status",
      action: "compile",
      data: { message: "Starting compilation...", sketchPath, board },
    });

    try {
      const result = await this.arduinoService.compile(
        sketchPath,
        board,
        (output: string) => {
          // Stream real-time output to client
          sendMessage(connection, {
            type: "output",
            action: "compile",
            data: { output },
          });
        }
      );

      if (result.success) {
        sendMessage(connection, {
          type: "complete",
          action: "compile",
          data: {
            success: true,
            message: "Compilation completed successfully",
            sketchPath,
            board,
            output: result.output,
          },
        });
        logger.info(`Compilation successful for ${sketchPath}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "compile",
          data: {
            error: result.error || "Compilation failed",
            output: result.output,
          },
        });
        logger.error(`Compilation failed for ${sketchPath}:`, result.error);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "compile",
        data: { error: `Compilation error: ${errorMessage}` },
      });
      logger.error(`Compilation error for ${sketchPath}:`, error);
    }
  }

  async handleVerify(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage
    ) => void
  ): Promise<void> {
    const { sketchPath, board } = message.payload;

    if (!sketchPath || !board) {
      sendMessage(connection, {
        type: "error",
        action: "verify",
        data: { error: "Missing required parameters: sketchPath and board" },
      });
      return;
    }

    logger.info(`Starting verification for ${sketchPath} with board ${board}`);

    // Send status update
    sendMessage(connection, {
      type: "status",
      action: "verify",
      data: { message: "Starting verification...", sketchPath, board },
    });

    try {
      const result = await this.arduinoService.verify(
        sketchPath,
        board,
        (output: string) => {
          // Stream real-time output to client
          sendMessage(connection, {
            type: "output",
            action: "verify",
            data: { output },
          });
        }
      );

      if (result.success) {
        sendMessage(connection, {
          type: "complete",
          action: "verify",
          data: {
            success: true,
            message: "Verification completed successfully",
            sketchPath,
            board,
            output: result.output,
          },
        });
        logger.info(`Verification successful for ${sketchPath}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "verify",
          data: {
            error: result.error || "Verification failed",
            output: result.output,
          },
        });
        logger.error(`Verification failed for ${sketchPath}:`, result.error);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "verify",
        data: { error: `Verification error: ${errorMessage}` },
      });
      logger.error(`Verification error for ${sketchPath}:`, error);
    }
  }
}
