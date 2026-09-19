import { ChildProcess, spawn } from "child_process";
import { config, logger } from "../config.js";
import type { BoardInfo } from "../types/messages.types.js";
import { ArduinoCliService } from "./arduino-cli.service.js";

/**
 * Event-driven board detection.
 *
 * Runs `arduino-cli board list --watch --format json` as a single long-lived
 * process. The CLI's pluggable discoveries push one JSON event per line
 * ("add" / "remove") the moment a port appears or disappears — including the
 * initial burst of "add" events for already-connected ports — so plug/unplug
 * is visible within ~100 ms instead of on the next poll.
 *
 * This replaces the old model where every frontend refresh spawned a fresh
 * `arduino-cli board list` snapshot (and the frontend polled only while no
 * board was connected, so unplugs went unnoticed).
 *
 * The service keeps the current port set in memory; `getBoards()` serves it
 * synchronously (making list-boards refreshes instant and CLI-spawn-free) and
 * `onChange` subscribers are notified (debounced) whenever the set changes so
 * they can broadcast to clients.
 *
 * If the watch process can't be started or keeps dying it backs off and
 * eventually gives up; `isRunning()` lets callers fall back to one-shot
 * `board list` snapshots in that case.
 */
export class BoardWatchService {
  private child: ChildProcess | null = null;
  private readonly cli = new ArduinoCliService();
  /** Detected boards keyed by port address. */
  private readonly portMap = new Map<string, BoardInfo[]>();
  private readonly changeHandlers = new Set<(boards: BoardInfo[]) => void>();
  private stdoutCarry = "";
  private restartCount = 0;
  private static readonly MAX_RESTARTS = 5;
  private stopped = false;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start(): void {
    this.stopped = false;
    this.spawnWatcher();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Current detected boards (flattened across ports). */
  getBoards(): BoardInfo[] {
    const all: BoardInfo[] = [];
    for (const boards of this.portMap.values()) all.push(...boards);
    return all;
  }

  /** Subscribe to board-set changes. Returns an unsubscribe function. */
  onChange(handler: (boards: BoardInfo[]) => void): () => void {
    this.changeHandlers.add(handler);
    return () => this.changeHandlers.delete(handler);
  }

  private spawnWatcher(): void {
    if (this.stopped) return;
    logger.info("Starting board watcher (arduino-cli board list --watch)");
    let child: ChildProcess;
    try {
      // NOTE: "jsonmini", not "json". arduino-cli's json format pretty-prints
      // every watch event across multiple lines (json.MarshalIndent), which
      // breaks the line-delimited parsing in consume() — every line fails
      // JSON.parse and is silently discarded, so no board is ever detected.
      // jsonmini emits exactly one compact JSON object per line.
      child = spawn(
        config.arduinoCliPath,
        ["board", "list", "--watch", "--format", "jsonmini"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (error) {
      logger.error("Failed to spawn board watcher:", error);
      this.scheduleRestart();
      return;
    }

    this.child = child;
    this.running = true;
    this.stdoutCarry = "";

    child.stdout?.on("data", (d: Buffer) => this.consume(d.toString()));
    child.stderr?.on("data", (d: Buffer) => {
      const text = d.toString().trim();
      if (text) logger.warn("board watcher stderr:", text);
    });
    child.on("error", (error) => {
      logger.error("Board watcher process error:", error);
    });
    child.on("close", (code) => {
      // Only react if this is still the active watcher (not a superseded one).
      if (this.child !== child) return;
      this.child = null;
      this.running = false;
      if (this.stopped) return;
      logger.warn(`Board watcher exited with code ${code}; restarting…`);
      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (this.stopped) return;
    this.restartCount++;
    if (this.restartCount > BoardWatchService.MAX_RESTARTS) {
      logger.error(
        "Board watcher failed repeatedly; giving up. Falling back to one-shot board scans."
      );
      return;
    }
    const delay = Math.min(1000 * 2 ** this.restartCount, 15000);
    setTimeout(() => this.spawnWatcher(), delay);
  }

  /** Lines that failed JSON.parse without a single event ever succeeding. */
  private parseFailStreak = 0;
  private warnedUnparseable = false;
  private everParsed = false;

  /** Line-buffer stdout and parse one JSON event per line. */
  private consume(chunk: string): void {
    this.stdoutCarry += chunk;
    const lines = this.stdoutCarry.split(/\r?\n/);
    this.stdoutCarry = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        this.handleEvent(JSON.parse(t));
        // A successfully parsed event means the watcher is healthy — allow
        // future restarts again.
        this.restartCount = 0;
        this.everParsed = true;
        this.parseFailStreak = 0;
      } catch {
        // Not JSON (banner/progress noise) — usually ignorable, but if we've
        // NEVER parsed an event and keep failing, the CLI's output format
        // probably isn't line-delimited JSON (e.g. someone switched jsonmini
        // back to the pretty-printed json format). Say so instead of silently
        // reporting zero boards forever.
        if (!this.everParsed && !this.warnedUnparseable) {
          this.parseFailStreak++;
          if (this.parseFailStreak >= 10) {
            this.warnedUnparseable = true;
            logger.warn(
              "Board watcher: stdout does not look like line-delimited JSON " +
                "(10+ unparseable lines, no events yet). Board detection may " +
                "be broken — check the arduino-cli --format flag (needs jsonmini)."
            );
          }
        }
      }
    }
  }

  /**
   * Handle one watch event. arduino-cli emits objects shaped like
   * `{ "eventType": "add"|"remove", "matching_boards": [...], "port": {...} }`
   * (key spellings vary slightly across CLI versions, so parse defensively).
   */
  private handleEvent(event: any): void {
    const type = String(
      event?.eventType ?? event?.event_type ?? event?.type ?? ""
    ).toLowerCase();
    // Some CLI versions nest the detected port under `port`, others inline it.
    const entry = event?.port !== undefined ? event : { port: event };
    const rawPort = entry.port?.port ?? entry.port ?? {};
    const address: string | undefined = rawPort.address || undefined;
    if (!address || (type !== "add" && type !== "remove")) return;

    if (type === "remove") {
      if (!this.portMap.delete(address)) return; // no change
    } else {
      // Reuse the same conversion as one-shot `board list` so both paths
      // produce identical BoardInfo entries (incl. VID/PID guesses).
      const portEntry = entry.port?.port ? entry.port : entry;
      const boards = this.cli.detectedPortToBoards(
        // `detectedPortToBoards` expects a detected-port entry: `{ port, matching_boards }`.
        {
          port: rawPort,
          matching_boards:
            portEntry.matching_boards ?? event?.matching_boards ?? [],
        }
      );
      if (boards.length === 0) {
        // Unidentifiable (non-USB) port — make sure it's not lingering.
        if (!this.portMap.delete(address)) return;
      } else {
        this.portMap.set(address, boards);
      }
    }
    this.notifySoon();
  }

  /** Debounce change notifications (plug events often arrive in bursts). */
  private notifySoon(): void {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      const boards = this.getBoards();
      logger.info(
        `Board watcher: ${boards.length} board(s) detected`,
        boards.map((b) => `${b.name}@${b.port}`)
      );
      for (const handler of this.changeHandlers) {
        try {
          handler(boards);
        } catch (error) {
          logger.error("board watch onChange handler failed:", error);
        }
      }
    }, 150);
  }
}
