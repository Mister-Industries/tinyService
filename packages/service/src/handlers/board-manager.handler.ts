import { logger } from "../config.js";
import { ArduinoCliService } from "../services/arduino-cli.service.js";
import {
  PackageJobBusyError,
  PackageJobsService,
  summarizeError,
} from "../services/package-jobs.service.js";
import type {
  ArduinoCliResult,
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

type Send = (connection: WebSocketConnection, message: OutgoingMessage) => void;

/**
 * Handles Boards Manager actions: platform (core) search/list/install/uninstall,
 * board-listall (every installable FQBN), and additional board-manager URL
 * management. Search/list/listall complete with a data payload.
 *
 * Install, uninstall and URL changes run through PackageJobsService: one at a
 * time, with progress broadcast to every client as the "package-jobs" push.
 * The requesting client also gets the finished output lines as "output"
 * messages and a final "complete" or "error". A request that arrives while
 * another operation runs is answered at once with an error carrying
 * `busy: true`.
 */
export class BoardManagerHandler {
  private arduinoService: ArduinoCliService;

  constructor(private readonly jobs: PackageJobsService) {
    this.arduinoService = new ArduinoCliService();
  }

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: Send
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
        const spec = version ? `${platform}@${version}` : platform;
        await this.runJob(
          connection,
          action,
          sendMessage,
          {
            kind: "core-install",
            target: platform,
            label: `Installing ${spec}`,
            changesPlatforms: true,
          },
          (onOutput) => this.arduinoService.installCore(spec, onOutput),
          `Installed ${platform}`,
          `Failed to install ${platform}`
        );
        return;
      }

      if (action === "core-uninstall") {
        await this.runJob(
          connection,
          action,
          sendMessage,
          {
            kind: "core-uninstall",
            target: platform,
            label: `Uninstalling ${platform}`,
            changesPlatforms: true,
          },
          (onOutput) => this.arduinoService.uninstallCore(platform, onOutput),
          `Uninstalled ${platform}`,
          `Failed to uninstall ${platform}`
        );
        return;
      }

      if (action === "board-url-add") {
        await this.runJob(
          connection,
          action,
          sendMessage,
          { kind: "url-add", target: url, label: `Adding ${url}` },
          async (onOutput) => {
            const added = await this.arduinoService.addBoardUrl(url);
            if (!added.success) return added;
            onOutput("Updating board index...\n");
            const updated = await this.arduinoService.updateCoreIndex(onOutput);
            if (updated.success) return updated;
            // arduino-cli fails the whole update when any one index can't be
            // fetched. What matters here is whether the new URL's index came.
            if (indexDownloaded(updated.output, url)) {
              return { ...updated, success: true, error: undefined };
            }
            return {
              ...updated,
              error: `Added the URL, but its board index could not be downloaded: ${summarizeError(updated)}`,
            };
          },
          `Added ${url}`,
          `Failed to add ${url}`
        );
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

  /** Run one package job and report it to the requesting client. */
  private async runJob(
    connection: WebSocketConnection,
    action: string,
    sendMessage: Send,
    request: Parameters<PackageJobsService["run"]>[0],
    run: (onOutput: (chunk: string) => void) => Promise<ArduinoCliResult>,
    successMessage: string,
    failureMessage: string
  ): Promise<void> {
    let result: ArduinoCliResult;
    try {
      sendMessage(connection, {
        type: "status",
        action,
        data: { message: `${request.label}...` },
      });
      result = await this.jobs.run(request, run, (line) =>
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
          data: {
            error: error.message,
            busy: true,
            activeJob: error.active,
          },
        });
        return;
      }
      throw error;
    }

    sendMessage(connection, {
      type: result.success ? "complete" : "error",
      action,
      data: result.success
        ? { success: true, message: successMessage, output: result.output }
        : { error: failureMessage, details: summarizeError(result) },
    });
  }
}

/**
 * Whether `core update-index` output shows the index at `url` arriving:
 * arduino-cli prints "Downloading index: <file name> downloaded" per index.
 */
export function indexDownloaded(output: string, url: string): boolean {
  const file = url.split(/[?#]/)[0].split("/").pop() ?? "";
  if (!file) return false;
  return output
    .split(/[\r\n]+/)
    .some((line) => line.includes(`Downloading index: ${file}`) && /\bdownloaded\s*$/.test(line.trim()));
}
