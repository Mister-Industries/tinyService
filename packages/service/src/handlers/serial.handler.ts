import { ChildProcess, spawn, execFile } from "child_process";
import { config, logger } from "../config.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * Serial monitor handler. Spawns `arduino-cli monitor` per connection and
 * streams its output back over the WebSocket as `serial` output messages.
 * The port can only be held by one process, so this is closed automatically
 * before an upload (see WebSocketService) and on disconnect.
 */
export class SerialHandler {
  private monitors = new Map<string, ChildProcess>();

  async handle(
    connection: WebSocketConnection,
    message: IncomingMessage,
    sendMessage: (
      connection: WebSocketConnection,
      message: OutgoingMessage
    ) => void
  ): Promise<void> {
    const { action } = message;

    if (action === "serial-write") {
      const child = this.monitors.get(connection.id);
      if (child?.stdin?.writable) child.stdin.write((message.payload.data || "") + "\n");
      return;
    }

    if (action === "serial-close") {
      await this.close(connection.id);
      sendMessage(connection, {
        type: "complete",
        action: "serial",
        data: { success: true, message: "closed", closed: true },
      });
      return;
    }

    // serial-open
    const port = message.payload.port || "";
    const baud = message.payload.baud || 9600;
    // Release any existing monitor AND wait for the process tree to actually die
    // before spawning a new one — otherwise the new monitor races the old one
    // for the (exclusive) port and fails with "command 'open' failed: busy".
    await this.close(connection.id);
    await new Promise((r) => setTimeout(r, 250));

    logger.info(`Opening serial monitor on ${port} @ ${baud}`);
    const child = spawn(
      config.arduinoCliPath,
      ["monitor", "-p", port, "-c", `baudrate=${baud}`],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    this.monitors.set(connection.id, child);

    const emit = (text: string): void => {
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        // Skip arduino-cli's own monitor banner/info/error noise so it doesn't
        // clutter the serial console (the "busy" line in particular).
        if (
          t.startsWith("Connected to") ||
          t.startsWith("Monitor port settings") ||
          t.startsWith("Press CTRL-C") ||
          t.startsWith("Disconnected") ||
          t.startsWith("Port monitor error") ||
          t.includes("command 'open' failed") ||
          /^baudrate\b/.test(t)
        )
          continue;
        sendMessage(connection, {
          type: "output",
          action: "serial",
          data: { output: t },
        });
      }
    };

    child.stdout?.on("data", (d: Buffer) => emit(d.toString()));
    child.stderr?.on("data", (d: Buffer) => emit(d.toString()));
    child.on("error", (e) => {
      logger.error("Serial monitor error:", e);
      sendMessage(connection, {
        type: "error",
        action: "serial",
        data: { error: `Serial monitor failed: ${e.message}` },
      });
      this.monitors.delete(connection.id);
    });
    child.on("close", () => {
      this.monitors.delete(connection.id);
      sendMessage(connection, {
        type: "complete",
        action: "serial",
        data: { success: true, message: "closed", closed: true },
      });
    });

    sendMessage(connection, {
      type: "status",
      action: "serial",
      data: { message: `Listening on ${port} @ ${baud}`, opened: true },
    });
  }

  /**
   * Stop and forget a connection's monitor (upload / disconnect / close).
   *
   * `arduino-cli monitor` spawns a separate pluggable serial-monitor tool that
   * is the process actually holding the port. On Windows a plain child.kill()
   * leaves that grandchild alive — so the port stays busy until the board is
   * unplugged. Kill the whole process tree instead.
   */
  close(connectionId: string): Promise<void> {
    const child = this.monitors.get(connectionId);
    if (!child) return Promise.resolve();
    this.monitors.delete(connectionId);
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      child.once("exit", finish);
      child.once("close", finish);
      try {
        if (process.platform === "win32" && child.pid) {
          execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {
            /* best-effort; the exit/close listeners resolve us */
          });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        finish();
      }
      // Safety net in case the exit event never fires.
      setTimeout(finish, 1500);
    });
  }
}
