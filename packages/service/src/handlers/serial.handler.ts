import { ChildProcess, spawn, execFile } from "child_process";
import { config, logger } from "../config.js";
import type {
  IncomingMessage,
  OutgoingMessage,
  WebSocketConnection,
} from "../types/messages.types.js";

/**
 * One live monitor session. Sessions are tracked as objects (not bare
 * ChildProcess references) so every child-process event handler can check
 * whether *its* session is still the current one before mutating shared
 * state — a stale handler from a killed monitor must never delete or
 * "close" its replacement.
 */
interface MonitorSession {
  child: ChildProcess;
  port: string;
  baud: number;
  /** True once arduino-cli printed its "Connected to …" banner. */
  confirmed: boolean;
  /** True when WE initiated the teardown (close/upload/reopen). */
  closedByUs: boolean;
  /** Banner/error text captured before confirmation, for error reporting. */
  preludeLines: string[];
  /** Partial (un-terminated) output line carried between chunks. */
  carry: string;
  carryTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Fallback open-confirmation timer. arduino-cli ≥1.x runs --quiet when its
   * stdout is a pipe (feedback.HasConsole() === false), printing NO banner on
   * a successful open — so if the process is still alive when this fires, we
   * declare the port open.
   */
  confirmTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Serial monitor handler. Spawns `arduino-cli monitor` per connection and
 * streams its output back over the WebSocket as `serial` output messages.
 * The port can only be held by one process, so this is closed automatically
 * before an upload (see WebSocketService) and on disconnect.
 *
 * Lifecycle contract with the client:
 * - `{type:"status", data:{opened:true}}` is sent once the open is confirmed:
 *   by banner ("Connected to …" on old CLIs, "Connecting to …" on 1.x), by
 *   the first sketch output line, or — because arduino-cli ≥1.x is silent on
 *   success when piped — by the process simply surviving the confirm timer.
 * - If the port can't be opened (busy/missing), an `error` message carrying
 *   arduino-cli's actual message is sent, followed by `{closed:true}`.
 * - `{type:"complete", data:{closed:true}}` is sent exactly once per session.
 */
export class SerialHandler {
  private sessions = new Map<string, MonitorSession>();

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
      const session = this.sessions.get(connection.id);
      if (session?.child.stdin?.writable) {
        const data = message.payload.data || "";
        // raw: client applied its own line ending (or wants none). Legacy
        // clients (no raw flag) keep the old append-"\n" behavior.
        session.child.stdin.write(message.payload.raw ? data : data + "\n");
      }
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

    const session: MonitorSession = {
      child,
      port,
      baud,
      confirmed: false,
      closedByUs: false,
      preludeLines: [],
      carry: "",
      carryTimer: null,
      confirmTimer: null,
    };
    this.sessions.set(connection.id, session);

    /** Is this session still the one registered for the connection? */
    const isCurrent = (): boolean =>
      this.sessions.get(connection.id) === session;

    const sendOutput = (text: string): void => {
      sendMessage(connection, {
        type: "output",
        action: "serial",
        data: { output: text },
      });
    };

    /** Declare the port open (idempotent) and tell the client. */
    const confirm = (): void => {
      if (!isCurrent() || session.confirmed) return;
      session.confirmed = true;
      if (session.confirmTimer) {
        clearTimeout(session.confirmTimer);
        session.confirmTimer = null;
      }
      sendMessage(connection, {
        type: "status",
        action: "serial",
        data: { message: `Listening on ${port} @ ${baud}`, opened: true },
      });
    };

    const handleLine = (line: string): void => {
      // Strip a trailing \r but preserve all other whitespace — sketches may
      // print indentation or column-aligned output on purpose.
      const raw = line.replace(/\r$/, "");
      const t = raw.trim();

      // Open confirmation. Old CLIs print "Connected to <port>!"; 1.x prints
      // "Connecting to <port>." — and only when stdout is a TTY. Spawned over
      // pipes, arduino-cli ≥1.x forces --quiet and prints NO banner at all,
      // so a banner can't be required: any unrecognized output line means the
      // port is open and the sketch is already talking (and a silent success
      // is caught by the confirm timer set after spawn).
      if (!session.confirmed) {
        if (t.startsWith("Connected to") || t.startsWith("Connecting to")) {
          confirm();
          return;
        }
        if (
          t.startsWith("Port monitor error") ||
          t.includes("command 'open' failed")
        ) {
          session.preludeLines.push(t);
          sendMessage(connection, {
            type: "error",
            action: "serial",
            data: { error: `Could not open ${port}: ${t}` },
          });
          return;
        }
        // Known pre-open banner noise (only printed in non-quiet mode) — hold
        // it for error reporting in case the open fails.
        if (
          !t ||
          t.startsWith("Using default monitor configuration") ||
          t.startsWith("Using generic monitor configuration") ||
          t.startsWith("WARNING:") ||
          t.startsWith("Monitor port settings") ||
          t.startsWith("Press CTRL-C") ||
          /^[0-9a-z_]+=\S*$/i.test(t)
        ) {
          if (t) session.preludeLines.push(t);
          return;
        }
        // Anything else: sketch output already flowing — the port is open.
        confirm();
        // fall through so this first line is forwarded like any other
      }

      // Post-connection: forward sketch output verbatim. Only arduino-cli's
      // own settings/teardown banners are skipped.
      if (
        t.startsWith("Monitor port settings") ||
        t.startsWith("Press CTRL-C") ||
        /^baudrate\b/.test(t)
      ) {
        return;
      }
      if (t.startsWith("Port monitor error")) {
        sendMessage(connection, {
          type: "error",
          action: "serial",
          data: { error: t },
        });
        return;
      }
      if (!raw) return; // drop empty lines (keeps the old console behavior)
      sendOutput(raw);
    };

    const emit = (text: string): void => {
      if (!isCurrent()) return; // stale stream from a superseded session
      if (session.carryTimer) {
        clearTimeout(session.carryTimer);
        session.carryTimer = null;
      }
      const combined = session.carry + text;
      const lines = combined.split("\n");
      session.carry = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
      // A partial line with no newline yet (e.g. an interactive prompt or a
      // Serial.print() without println) — flush it after a short quiet period
      // so it still reaches the console.
      if (session.carry) {
        session.carryTimer = setTimeout(() => {
          if (!isCurrent()) return;
          const pending = session.carry;
          session.carry = "";
          session.carryTimer = null;
          handleLine(pending);
        }, 120);
      }
    };

    child.stdout?.on("data", (d: Buffer) => emit(d.toString()));
    child.stderr?.on("data", (d: Buffer) => emit(d.toString()));

    // arduino-cli ≥1.x prints nothing on a successful open when piped, so if
    // the process is still alive shortly after spawn, declare the port open.
    // Failed opens exit quickly and are reported from the close handler; a
    // failure slower than this timer still surfaces there via the non-zero
    // exit code.
    session.confirmTimer = setTimeout(confirm, 1200);

    child.on("error", (e) => {
      if (!isCurrent()) return;
      logger.error("Serial monitor error:", e);
      sendMessage(connection, {
        type: "error",
        action: "serial",
        data: { error: `Serial monitor failed: ${e.message}` },
      });
      this.sessions.delete(connection.id);
    });

    child.on("close", (code) => {
      // A stale close event from a killed predecessor must not touch the
      // current session's registration or connection state.
      if (!isCurrent()) return;
      if (session.carryTimer) clearTimeout(session.carryTimer);
      if (session.confirmTimer) clearTimeout(session.confirmTimer);
      this.sessions.delete(connection.id);

      // Died on its own (not torn down by us) without ever confirming, or
      // with a non-zero exit code: that's a failed/aborted open. Surface why
      // (arduino-cli's own words if we captured them).
      if (
        !session.closedByUs &&
        (!session.confirmed || (code !== null && code !== 0))
      ) {
        const detail =
          session.preludeLines.slice(-3).join(" ") ||
          `arduino-cli monitor exited with code ${code ?? "?"}`;
        sendMessage(connection, {
          type: "error",
          action: "serial",
          data: { error: `Could not open ${port}: ${detail}` },
        });
      }

      sendMessage(connection, {
        type: "complete",
        action: "serial",
        data: { success: true, message: "closed", closed: true },
      });
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
    const session = this.sessions.get(connectionId);
    if (!session) return Promise.resolve();
    session.closedByUs = true;
    if (session.carryTimer) clearTimeout(session.carryTimer);
    if (session.confirmTimer) clearTimeout(session.confirmTimer);
    this.sessions.delete(connectionId);
    const { child } = session;
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
