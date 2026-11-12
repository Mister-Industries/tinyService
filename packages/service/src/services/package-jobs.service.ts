import type {
  ArduinoCliResult,
  BoardSetupState,
  PackageJob,
  PackageJobsState,
} from "@mister-industries/shared";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../config.js";
import { InstallProgressParser } from "./install-progress.js";

/** Thrown when an operation is requested while another one is running. */
export class PackageJobBusyError extends Error {
  constructor(readonly active: PackageJob) {
    super(
      `${active.label} is still running. Wait for it to finish, then try again.`
    );
    this.name = "PackageJobBusyError";
  }
}

export interface PackageJobRequest {
  kind: PackageJob["kind"];
  target: string;
  label: string;
  origin?: PackageJob["origin"];
  /**
   * Whether the job changes the installed platforms. Board discovery is paused
   * for those (as the Arduino IDE does) and restarted afterwards, so boards
   * that are already plugged in get re-identified with the new platforms.
   */
  changesPlatforms?: boolean;
}

export interface PlatformChangeHooks {
  /** Called before a platform-changing job starts. */
  pause(): void | Promise<void>;
  /** Called after it ends, whatever the outcome. */
  resume(): void | Promise<void>;
}

/** How often progress is broadcast at most while a download is running. */
const BROADCAST_INTERVAL_MS = 250;

/**
 * Runs package operations (platform/library installs and uninstalls, index
 * updates) one at a time and keeps every client informed.
 *
 * arduino-cli writes into one shared data directory, so two installs at once
 * can trip over each other, and a second click on "Install" used to start a
 * duplicate of a download that was still running. Here a second request is
 * refused with PackageJobBusyError while one is active, and the state of the
 * running job (with parsed download progress) is pushed to all connections, so
 * a reconnecting or second window sees it too.
 */
export class PackageJobsService {
  private active: PackageJob | null = null;
  private last: PackageJob | null = null;
  private setup: BoardSetupState = { state: "idle", platforms: [] };
  private readonly listeners = new Set<(state: PackageJobsState) => void>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBroadcast = 0;

  constructor(private readonly hooks?: PlatformChangeHooks) {}

  getState(): PackageJobsState {
    return {
      active: this.active ? cloneJob(this.active) : null,
      last: this.last ? cloneJob(this.last) : null,
      setup: {
        ...this.setup,
        platforms: this.setup.platforms.map((p) => ({ ...p })),
      },
    };
  }

  isBusy(): boolean {
    return this.active !== null;
  }

  onChange(listener: (state: PackageJobsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replace the board-setup part of the state and broadcast it. */
  updateSetup(update: Partial<BoardSetupState>): void {
    this.setup = { ...this.setup, ...update };
    this.emitNow();
  }

  /**
   * Run one operation. `run` receives an output callback to hand to
   * arduino-cli; its raw output is parsed for progress and the finished lines
   * are forwarded to `onLine` (for the requesting client's log).
   *
   * Throws PackageJobBusyError if another operation is running.
   */
  async run(
    request: PackageJobRequest,
    run: (onOutput: (chunk: string) => void) => Promise<ArduinoCliResult>,
    onLine?: (line: string) => void
  ): Promise<ArduinoCliResult> {
    if (this.active) throw new PackageJobBusyError(cloneJob(this.active));

    const job: PackageJob = {
      id: uuidv4(),
      kind: request.kind,
      target: request.target,
      label: request.label,
      origin: request.origin ?? "user",
      startedAt: Date.now(),
      state: "running",
      done: [],
    };
    this.active = job;
    this.emitNow();
    logger.info(`Package job started: ${job.label}`);

    const parser = new InstallProgressParser();
    const absorb = (lines: string[]): void => {
      Object.assign(job, parser.snapshot());
      for (const line of lines) onLine?.(line);
      this.emitSoon();
    };

    let result: ArduinoCliResult;
    let paused = false;
    try {
      if (request.changesPlatforms && this.hooks) {
        await this.hooks.pause();
        paused = true;
      }
      result = await run((chunk) => absorb(parser.feed(chunk)));
    } catch (error) {
      result = {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      absorb(parser.end());
      if (paused) {
        try {
          await this.hooks!.resume();
        } catch (error) {
          logger.error("Could not restart board discovery:", error);
        }
      }
    }

    job.state = result.success ? "succeeded" : "failed";
    job.finishedAt = Date.now();
    job.current = undefined;
    if (!result.success) job.error = summarizeError(result);
    this.active = null;
    this.last = job;
    this.emitNow();
    logger.info(
      `Package job ${job.state}: ${job.label}` +
        (job.error ? ` (${job.error})` : "")
    );
    return result;
  }

  /** Resolves once no operation is running. */
  whenIdle(): Promise<void> {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onChange((state) => {
        if (!state.active) {
          off();
          resolve();
        }
      });
    });
  }

  /**
   * Like run(), but waits its turn instead of failing when another operation
   * is running. For background work (the board setup), not user requests.
   */
  async runWhenIdle(
    request: PackageJobRequest,
    run: (onOutput: (chunk: string) => void) => Promise<ArduinoCliResult>,
    onLine?: (line: string) => void
  ): Promise<ArduinoCliResult> {
    for (;;) {
      await this.whenIdle();
      try {
        return await this.run(request, run, onLine);
      } catch (error) {
        if (!(error instanceof PackageJobBusyError)) throw error;
        // Someone else got the slot first; wait for it again.
      }
    }
  }

  private emitSoon(): void {
    if (this.broadcastTimer) return;
    const wait = Math.max(
      0,
      BROADCAST_INTERVAL_MS - (Date.now() - this.lastBroadcast)
    );
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.emitNow();
    }, wait);
  }

  private emitNow(): void {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.lastBroadcast = Date.now();
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        logger.error("package-jobs listener failed:", error);
      }
    }
  }
}

function cloneJob(job: PackageJob): PackageJob {
  return {
    ...job,
    done: [...job.done],
    ...(job.current ? { current: { ...job.current } } : {}),
  };
}

/**
 * The useful part of a failed command's output: arduino-cli's own
 * "Error during install: ..." line when there is one, else the last line.
 */
export function summarizeError(result: ArduinoCliResult): string {
  const text = `${result.error ?? ""}\n${result.output ?? ""}`;
  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errorLine = lines.find((l) =>
    /^(Error during|Error:|Invalid argument|Platform .* not found)/i.test(l)
  );
  return errorLine ?? lines[lines.length - 1] ?? "Unknown error";
}
