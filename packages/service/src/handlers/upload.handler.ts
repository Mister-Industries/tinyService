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

export class UploadHandler {
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
    const { sketchPath, board, port, files, sketchName } = message.payload;

    if ((!sketchPath && !files) || !board || !port) {
      sendMessage(connection, {
        type: "error",
        action: "upload",
        data: {
          error:
            "Missing required parameters: (sketchPath or files), board, and port",
        },
      });
      return;
    }

    const streamOutput = (output: string): void => {
      sendMessage(connection, {
        type: "output",
        action: "upload",
        data: { output },
      });
    };

    // Web build: the sketch arrives as file contents with no real path. Write
    // it to a temp dir, then compile *into that same dir* before uploading —
    // arduino-cli's `upload` needs a build present, and a fresh temp dir has
    // none (desktop reuses one path across compile+upload, so it's fine there).
    let materialized: MaterializedSketch | null = null;
    let effectiveSketchPath = sketchPath;
    try {
      if (files) {
        materialized = await materializeSketch(files, sketchName);
        effectiveSketchPath = materialized.sketchPath;

        sendMessage(connection, {
          type: "status",
          action: "upload",
          data: {
            message: "Compiling before upload...",
            sketchPath: effectiveSketchPath,
            board,
            port,
          },
        });

        const compileResult = await this.arduinoService.compile(
          effectiveSketchPath,
          board,
          streamOutput
        );
        if (!compileResult.success) {
          sendMessage(connection, {
            type: "error",
            action: "upload",
            data: {
              error: compileResult.error || "Compilation failed before upload",
              output: compileResult.output,
            },
          });
          logger.error(
            `Pre-upload compile failed for ${effectiveSketchPath}:`,
            compileResult.error
          );
          return;
        }
      }

      logger.info(
        `Starting upload for ${effectiveSketchPath} to board ${board} on port ${port}`
      );

      // Send status update
      sendMessage(connection, {
        type: "status",
        action: "upload",
        data: {
          message: "Starting upload...",
          sketchPath: effectiveSketchPath,
          board,
          port,
        },
      });

      const result = await this.arduinoService.upload(
        effectiveSketchPath,
        board,
        port,
        streamOutput
      );

      if (result.success) {
        sendMessage(connection, {
          type: "complete",
          action: "upload",
          data: {
            success: true,
            message: "Upload completed successfully",
            sketchPath: effectiveSketchPath,
            board,
            port,
            output: result.output,
          },
        });
        logger.info(`Upload successful for ${effectiveSketchPath} to ${port}`);
      } else {
        sendMessage(connection, {
          type: "error",
          action: "upload",
          data: {
            error: result.error || "Upload failed",
            output: result.output,
          },
        });
        logger.error(`Upload failed for ${effectiveSketchPath}:`, result.error);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      sendMessage(connection, {
        type: "error",
        action: "upload",
        data: { error: `Upload error: ${errorMessage}` },
      });
      logger.error(`Upload error for ${effectiveSketchPath}:`, error);
    } finally {
      await materialized?.cleanup();
    }
  }
}
