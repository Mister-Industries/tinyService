import type { BoardSetupService } from "../services/board-setup.service.js";
import type { PackageJobsService } from "../services/package-jobs.service.js";
import type {
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * "install-cores": run the board setup again, installing any default platform
 * that is missing, including one the user removed earlier. Progress arrives as
 * the "package-jobs" push like any install; this replies when it is done.
 */
export async function handleInstallCores(
  connection: WebSocketConnection,
  setup: BoardSetupService,
  jobs: PackageJobsService,
  sendMessage: (connection: WebSocketConnection, message: OutgoingMessage) => void
): Promise<void> {
  sendMessage(connection, {
    type: "status",
    action: "install-cores",
    data: { message: "Checking board support..." },
  });

  await setup.run({ force: true });
  const state = jobs.getState().setup;

  if (state.state === "done") {
    sendMessage(connection, {
      type: "complete",
      action: "install-cores",
      data: {
        success: true,
        message: "Board support is installed",
        platforms: state.platforms,
      },
    });
  } else {
    sendMessage(connection, {
      type: "error",
      action: "install-cores",
      data: {
        error: state.message || "Failed to install board support",
        details: state.error,
        platforms: state.platforms,
      },
    });
  }
}
