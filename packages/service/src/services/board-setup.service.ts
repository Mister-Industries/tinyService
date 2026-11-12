import type { SetupPlatform } from "@mister-industries/shared";
import { promises as fs } from "fs";
import path from "path";
import { config, logger } from "../config.js";
import { ArduinoCliService } from "./arduino-cli.service.js";
import { PackageJobsService, summarizeError } from "./package-jobs.service.js";

/** Espressif's board index (ESP32, S2, S3, C3, C5, C6, H2, P4 boards). */
export const ESPRESSIF_INDEX_URL =
  "https://espressif.github.io/arduino-esp32/package_esp32_index.json";

/** MR.INDUSTRIES' board index (the tinyCore platform). */
export const TINYCORE_INDEX_URL =
  "https://raw.githubusercontent.com/Mister-Industries/arduino-board-index/refs/heads/main/package_tiny_core_index.json";

/** Board-manager URLs tinyService makes sure are configured. */
export const DEFAULT_BOARD_MANAGER_URLS = [
  ESPRESSIF_INDEX_URL,
  TINYCORE_INDEX_URL,
];

/**
 * Platforms installed automatically, in order. tinyCore goes first: it is a
 * fraction of the size of Espressif's package (about 0.6 GB against 1.8 GB on
 * macOS), so a tinyCore is ready to program long before the rest finishes.
 * Espressif's package brings every other ESP32 board, SparkFun's included.
 */
export const DEFAULT_SETUP_PLATFORMS: Array<{ id: string; name: string }> = [
  { id: "tinyCore:esp32", name: "tinyCore" },
  { id: "esp32:esp32", name: "ESP32 boards (Espressif)" },
];

/** Refresh the board index when it is older than this (the IDE uses a day). */
const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Remembers which platforms the setup installed, in arduino-cli's data dir. */
const MARKER_FILE = "tinyservice-setup.json";

interface SetupMarker {
  /** Platforms this setup has installed at least once. */
  autoInstalled: string[];
}

/**
 * Gets a fresh install ready to program boards without visiting the Boards
 * Manager: adds the board-manager URLs, keeps the index fresh, and installs
 * the default platforms.
 *
 * A platform is installed automatically only once. If the user uninstalls it
 * later, it stays uninstalled; `run({ force: true })` (the "install-cores"
 * action) installs anything missing again.
 */
export class BoardSetupService {
  private readonly cli = new ArduinoCliService();
  private running: Promise<void> | null = null;

  constructor(private readonly jobs: PackageJobsService) {}

  /** Start the setup unless it is already running. */
  run(options: { force?: boolean } = {}): Promise<void> {
    if (!this.running) {
      this.running = this.runOnce(options.force ?? false).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async runOnce(force: boolean): Promise<void> {
    if (!config.autoSetup && !force) {
      this.jobs.updateSetup({ state: "disabled", platforms: [] });
      return;
    }

    const wanted = (config.setupPlatforms ?? DEFAULT_SETUP_PLATFORMS).map(
      (p): SetupPlatform => ({ ...p, status: "pending" })
    );
    const setStatus = (id: string, update: Partial<SetupPlatform>): void => {
      const platform = wanted.find((p) => p.id === id);
      if (platform) Object.assign(platform, update);
      this.jobs.updateSetup({ platforms: wanted.map((p) => ({ ...p })) });
    };
    this.jobs.updateSetup({
      state: "running",
      message: "Checking board-manager URLs",
      platforms: wanted.map((p) => ({ ...p })),
      error: undefined,
    });

    try {
      if (!(await this.cli.checkAvailability())) {
        throw new Error("arduino-cli is not available");
      }

      // 1. Board-manager URLs.
      const urls = await this.cli.listBoardUrls();
      const missing = (config.boardManagerUrls ?? DEFAULT_BOARD_MANAGER_URLS)
        .filter((url) => !urls.includes(url));
      for (const url of missing) {
        const added = await this.cli.addBoardUrl(url);
        if (!added.success) {
          logger.error(`Could not add board-manager URL ${url}:`, added.error);
        }
      }

      // 2. Board index, when new URLs were added or it is stale/missing.
      const dataDir = await this.cli.getDataDir();
      if (missing.length > 0 || (await this.indexIsStale(dataDir))) {
        this.jobs.updateSetup({ message: "Updating the board index" });
        const update = await this.jobs.runWhenIdle(
          {
            kind: "index-update",
            target: "board index",
            label: "Updating the board index",
            origin: "setup",
          },
          (onOutput) => this.cli.updateCoreIndex(onOutput)
        );
        // arduino-cli fails the whole command if any one index can't be
        // fetched; the others are still updated, so keep going.
        if (!update.success) {
          logger.warn("Board index update reported errors:", update.error);
        }
      }

      // 3. Default platforms.
      const marker = await readMarker(dataDir);
      const installed = new Set(
        (await this.cli.listInstalledCores()).map((p) => p.id)
      );
      for (const platform of wanted) {
        if (installed.has(platform.id)) {
          setStatus(platform.id, { status: "installed" });
          remember(marker, platform.id);
          continue;
        }
        if (!force && marker.autoInstalled.includes(platform.id)) {
          // Installed by an earlier setup and removed since: respect that.
          setStatus(platform.id, { status: "skipped" });
          continue;
        }

        this.jobs.updateSetup({ message: `Installing ${platform.name}` });
        setStatus(platform.id, { status: "installing" });
        const result = await this.jobs.runWhenIdle(
          {
            kind: "core-install",
            target: platform.id,
            label: `Installing ${platform.name}`,
            origin: "setup",
            changesPlatforms: true,
          },
          (onOutput) => this.cli.installCore(platform.id, onOutput)
        );
        if (result.success) {
          setStatus(platform.id, { status: "installed", error: undefined });
          remember(marker, platform.id);
        } else {
          setStatus(platform.id, {
            status: "failed",
            error: summarizeError(result),
          });
        }
        await writeMarker(dataDir, marker);
      }
      await writeMarker(dataDir, marker);

      const failed = wanted.filter((p) => p.status === "failed");
      this.jobs.updateSetup({
        state: failed.length ? "failed" : "done",
        message: failed.length
          ? `Could not install ${failed.map((p) => p.name).join(", ")}`
          : "Boards are ready",
        error: failed.length ? failed[0].error : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Board setup failed:", error);
      this.jobs.updateSetup({
        state: "failed",
        message: "Board setup failed",
        error: message,
      });
    }
  }

  /** True when the main package index is missing or older than a day. */
  private async indexIsStale(dataDir: string | undefined): Promise<boolean> {
    if (!dataDir) return true;
    try {
      const stat = await fs.stat(path.join(dataDir, "package_index.json"));
      return Date.now() - stat.mtimeMs > INDEX_MAX_AGE_MS;
    } catch {
      return true;
    }
  }
}

function remember(marker: SetupMarker, id: string): void {
  if (!marker.autoInstalled.includes(id)) marker.autoInstalled.push(id);
}

async function readMarker(dataDir: string | undefined): Promise<SetupMarker> {
  if (!dataDir) return { autoInstalled: [] };
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(dataDir, MARKER_FILE), "utf8")
    );
    return {
      autoInstalled: Array.isArray(raw?.autoInstalled)
        ? raw.autoInstalled.filter((x: unknown) => typeof x === "string")
        : [],
    };
  } catch {
    return { autoInstalled: [] };
  }
}

async function writeMarker(
  dataDir: string | undefined,
  marker: SetupMarker
): Promise<void> {
  if (!dataDir) return;
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, MARKER_FILE),
      JSON.stringify(marker, null, 2)
    );
  } catch (error) {
    logger.warn("Could not save the board setup state:", error);
  }
}
