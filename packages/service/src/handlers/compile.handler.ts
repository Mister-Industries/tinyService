import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import {
  materializeSketch,
  type MaterializedSketch,
} from "../services/sketch-workspace.js";
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
    const { sketchPath, board, files, sketchName } = message.payload;

    if ((!sketchPath && !files) || !board) {
      sendMessage(connection, {
        type: "error",
        action: "compile",
        data: {
          error: "Missing required parameters: (sketchPath or files) and board",
        },
      });
      return;
    }

    // Web build: the sketch arrives as file contents with no real path — write
    // it to a temp dir so arduino-cli has something to compile.
    let materialized: MaterializedSketch | null = null;
    let effectiveSketchPath = sketchPath;
    try {
      if (files) {
        materialized = await materializeSketch(files, sketchName);
        effectiveSketchPath = materialized.sketchPath;
      }

      logger.info(
        `Starting compilation for ${effectiveSketchPath} with board ${board}`
      );

      // Send status update
      sendMessage(connection, {
        type: "status",
        action: "compile",
        data: {
          message: "Starting compilation...",
          sketchPath: effectiveSketchPath,
          board,
        },
      });

      const result = await this.arduinoService.compile(
        effectiveSketchPath,
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
            sketchPath: effectiveSketchPath,
            board,
            output: result.output,
          },
        });
        logger.info(`Compilation successful for ${effectiveSketchPath}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "compile",
          data: {
            error: result.error || "Compilation failed",
            output: result.output,
          },
        });
        logger.error(
          `Compilation failed for ${effectiveSketchPath}:`,
          result.error
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "compile",
        data: { error: `Compilation error: ${errorMessage}` },
      });
      logger.error(`Compilation error for ${effectiveSketchPath}:`, error);
    } finally {
      await materialized?.cleanup();
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
    const { sketchPath, board, files, sketchName } = message.payload;

    if ((!sketchPath && !files) || !board) {
      sendMessage(connection, {
        type: "error",
        action: "verify",
        data: {
          error: "Missing required parameters: (sketchPath or files) and board",
        },
      });
      return;
    }

    // Web build: materialize the inline sketch to a temp dir (see handle()).
    let materialized: MaterializedSketch | null = null;
    let effectiveSketchPath = sketchPath;
    try {
      if (files) {
        materialized = await materializeSketch(files, sketchName);
        effectiveSketchPath = materialized.sketchPath;
      }

      logger.info(
        `Starting verification for ${effectiveSketchPath} with board ${board}`
      );

      // Send status update
      sendMessage(connection, {
        type: "status",
        action: "verify",
        data: {
          message: "Starting verification...",
          sketchPath: effectiveSketchPath,
          board,
        },
      });

      const result = await this.arduinoService.verify(
        effectiveSketchPath,
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
            sketchPath: effectiveSketchPath,
            board,
            output: result.output,
          },
        });
        logger.info(`Verification successful for ${effectiveSketchPath}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "verify",
          data: {
            error: result.error || "Verification failed",
            output: result.output,
          },
        });
        logger.error(
          `Verification failed for ${effectiveSketchPath}:`,
          result.error
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "verify",
        data: { error: `Verification error: ${errorMessage}` },
      });
      logger.error(`Verification error for ${effectiveSketchPath}:`, error);
    } finally {
      await materialized?.cleanup();
    }
  }
}
