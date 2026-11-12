import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import {
  PackageJobBusyError,
  PackageJobsService,
  summarizeError,
} from "../services/package-jobs.service.js";
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

  constructor(private readonly jobs: PackageJobsService) {
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

      if (action === "lib-install" || action === "lib-uninstall") {
        const installing = action === "lib-install";
        const spec = installing && version ? `${library}@${version}` : library;
        if (installing) {
          sendMessage(connection, {
            type: "status",
            action,
            data: { message: `Installing ${spec}...` },
          });
        }
        let result;
        try {
          // Library installs share the one-at-a-time slot with platform
          // installs: both write into arduino-cli's data directory.
          result = await this.jobs.run(
            {
              kind: installing ? "lib-install" : "lib-uninstall",
              target: library,
              label: `${installing ? "Installing" : "Uninstalling"} ${spec}`,
            },
            (onOutput) =>
              installing
                ? this.arduinoService.installLibrary(library, version, onOutput)
                : this.arduinoService.uninstallLibrary(library, onOutput),
            (line) =>
              sendMessage(connection, {
                type: "output",
                action,
                data: { output: line },
              })
          );
        } catch (error) {
          if (error instanceof PackageJobBusyError) {
            sendMessage(connection, {
              type: "error",
              action,
              data: { error: error.message, busy: true, activeJob: error.active },
            });
            return;
          }
          throw error;
        }
        const verb = installing ? "install" : "uninstall";
        sendMessage(connection, {
          type: result.success ? "complete" : "error",
          action,
          data: result.success
            ? {
                success: true,
                message: `${installing ? "Installed" : "Uninstalled"} ${library}`,
                output: result.output,
              }
            : { error: `Failed to ${verb} ${library}`, details: summarizeError(result) },
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
