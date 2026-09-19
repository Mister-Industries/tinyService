import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * Handles library manager actions: lib-search, lib-list, lib-install,
 * lib-uninstall. Search/list complete with a `libraries` payload; install
 * streams arduino-cli output then completes.
 */
export class LibraryHandler {
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
    const { action } = message;
    const library = message.payload.library || "";
    const version = message.payload.version;

    try {
      if (action === "lib-search") {
        const libraries = await this.arduinoService.searchLibraries(library);
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `Found ${libraries.length}`, libraries },
        });
        return;
      }

      if (action === "lib-list") {
        const libraries = await this.arduinoService.listLibraries();
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `${libraries.length} installed`, libraries },
        });
        return;
      }

      if (action === "lib-install") {
        sendMessage(connection, {
          type: "status",
          action,
          data: { message: `Installing ${library}...` },
        });
        const result = await this.arduinoService.installLibrary(
          library,
          version,
          (output) =>
            sendMessage(connection, {
              type: "output",
              action,
              data: { output },
            })
        );
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? { success: true, message: `Installed ${library}`, output: result.output }
            : { error: `Failed to install ${library}`, details: result.error },
        });
        return;
      }

      if (action === "lib-uninstall") {
        const result = await this.arduinoService.uninstallLibrary(library);
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? { success: true, message: `Uninstalled ${library}`, output: result.output }
            : { error: `Failed to uninstall ${library}`, details: result.error },
        });
        return;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error handling ${action}:`, error);
      sendMessage(connection, {
        type: "error",
        action,
        data: { error: `Library operation failed: ${errorMessage}` },
      });
    }
  }
}
