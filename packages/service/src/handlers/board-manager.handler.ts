import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * Handles Boards Manager actions: platform (core) search/list/install/uninstall,
 * board-listall (every installable FQBN), and additional board-manager URL
 * management. Search/list/listall complete with a data payload; install and
 * url-add stream arduino-cli output then complete.
 */
export class BoardManagerHandler {
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
    const platform = message.payload.library || "";
    const version = message.payload.version;
    const url = message.payload.url || "";

    try {
      if (action === "core-search") {
        const platforms = await this.arduinoService.searchCores(platform);
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `Found ${platforms.length}`, platforms },
        });
        return;
      }

      if (action === "core-list") {
        const platforms = await this.arduinoService.listInstalledCores();
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `${platforms.length} installed`, platforms },
        });
        return;
      }

      if (action === "board-listall") {
        const boards = await this.arduinoService.listAllBoards();
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `${boards.length} boards`, boards },
        });
        return;
      }

      if (action === "board-url-list") {
        const urls = await this.arduinoService.listBoardUrls();
        sendMessage(connection, {
          type: "complete",
          action,
          data: { success: true, message: `${urls.length} urls`, urls },
        });
        return;
      }

      if (action === "core-install") {
        sendMessage(connection, {
          type: "status",
          action,
          data: { message: `Installing ${platform}...` },
        });
        const result = await this.arduinoService.installCore(
          version ? `${platform}@${version}` : platform,
          (output) =>
            sendMessage(connection, { type: "output", action, data: { output } })
        );
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? { success: true, message: `Installed ${platform}`, output: result.output }
            : { error: `Failed to install ${platform}`, details: result.error },
        });
        return;
      }

      if (action === "core-uninstall") {
        const result = await this.arduinoService.uninstallCore(platform);
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? { success: true, message: `Uninstalled ${platform}`, output: result.output }
            : { error: `Failed to uninstall ${platform}`, details: result.error },
        });
        return;
      }

      if (action === "board-url-add") {
        sendMessage(connection, {
          type: "status",
          action,
          data: { message: `Adding ${url}...` },
        });
        const addResult = await this.arduinoService.addBoardUrl(url);
        if (!addResult.success) {
          sendMessage(connection, {
            type: "error",
            action,
            data: { error: `Failed to add ${url}`, details: addResult.error },
          });
          return;
        }
        // Refresh the index so the new URL's platforms are searchable.
        sendMessage(connection, {
          type: "output",
          action,
          data: { output: "Updating board index...\n" },
        });
        const updateResult = await this.arduinoService.updateCoreIndex();
        sendMessage(connection, {
          type: updateResult.success ? "complete" : "error",
          action,
          data: updateResult.success
            ? { success: true, message: `Added ${url}`, output: updateResult.output }
            : { error: `Added ${url} but index update failed`, details: updateResult.error },
        });
        return;
      }

      if (action === "board-url-remove") {
        const result = await this.arduinoService.removeBoardUrl(url);
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? { success: true, message: `Removed ${url}`, output: result.output }
            : { error: `Failed to remove ${url}`, details: result.error },
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
        data: { error: `Boards Manager operation failed: ${errorMessage}` },
      });
    }
  }
}
