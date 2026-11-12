import { ChildProcess, spawn } from "child_process";
import { config, logger } from "../config.js";
import type { ArduinoCliResult, BoardInfo } from "../types/messages.types.js";

/**
 * How long an install may go without printing anything before it is treated as
 * stuck. Downloads print progress several times a second; the longest silent
 * stretch is unpacking a big toolchain, which takes a few minutes on a slow disk.
 */
export const INSTALL_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export class ArduinoCliService {
  private readonly cliPath: string;

  constructor() {
    this.cliPath = config.arduinoCliPath;
  }

  /**
   * Compile an Arduino sketch
   */
  async compile(
    sketchPath: string,
    board: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["compile", "--fqbn", board, sketchPath],
      onOutput
    );
  }

  /**
   * Upload a compiled sketch to the board
   */
  async upload(
    sketchPath: string,
    board: string,
    port: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["upload", "--fqbn", board, "--port", port, sketchPath],
      onOutput
    );
  }

  /**
   * Verify (compile without uploading) an Arduino sketch
   */
  async verify(
    sketchPath: string,
    board: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["compile", "--verify", "--fqbn", board, sketchPath],
      onOutput
    );
  }

  /**
   * List connected boards with a one-shot `board list`. Used when the board
   * watcher isn't running; see detectedPortToBoards for the shape.
   */
  async listBoards(): Promise<BoardInfo[]> {
    try {
      const result = await this.executeCommand([
        "board",
        "list",
        "--format",
        "json",
      ]);

      if (!result.success) {
        logger.error("Failed to list boards:", result.error);
        return [];
      }

      const boardsData = JSON.parse(result.output);
      const boards: BoardInfo[] = [];

      if (
        boardsData.detected_ports &&
        Array.isArray(boardsData.detected_ports)
      ) {
        for (const port of boardsData.detected_ports) {
          boards.push(...this.detectedPortToBoards(port));
        }
      }

      logger.info(`Found ${boards.length} board(s):`, boards);
      return boards;
    } catch (error) {
      logger.error("Error parsing boards list:", error);
      return [];
    }
  }

  /**
   * Convert one arduino-cli detected-port entry (from `board list` or a
   * `board list --watch` add event) into BoardInfo entries, one per board
   * arduino-cli matched to the port.
   *
   * This reports what arduino-cli found and nothing more: every match is kept
   * (a port can match several platforms' boards), placeholders keep their
   * `isHidden` flag, and a USB port nothing matched is listed once with an
   * empty FQBN so the user can pick its board. Deciding what to do with a
   * placeholder or an unknown device is the client's job. The port's USB
   * vid/pid/serial number ride along so clients can remember a choice per
   * device.
   */
  detectedPortToBoards(portEntry: any): BoardInfo[] {
    const rawPort = portEntry?.port ?? portEntry ?? {};
    const address: string | undefined = rawPort.address || undefined;
    if (!address) return [];
    const protocol: string | undefined = rawPort.protocol || undefined;

    const props = rawPort.properties || {};
    const usb = {
      vid: normalizeUsbId(props.vid ?? props.VID),
      pid: normalizeUsbId(props.pid ?? props.PID),
      serialNumber:
        (props.serialNumber ?? props.serial_number ?? "") || undefined,
    };
    const portInfo = {
      port: address,
      protocol,
      ...(usb.vid ? { vid: usb.vid } : {}),
      ...(usb.pid ? { pid: usb.pid } : {}),
      ...(usb.serialNumber ? { serialNumber: String(usb.serialNumber) } : {}),
    };

    const matching: any[] = (
      portEntry?.matching_boards ??
      portEntry?.matchingBoards ??
      []
    ).filter((mb: any) => mb?.fqbn);

    if (matching.length > 0) {
      // Real boards before discovery placeholders; otherwise keep the CLI's
      // order (it already puts Arduino-maintained boards first).
      const ordered = [
        ...matching.filter((mb) => !isHiddenMatch(mb)),
        ...matching.filter((mb) => isHiddenMatch(mb)),
      ];
      return ordered.map((mb) => ({
        fqbn: String(mb.fqbn),
        name: String(mb.name || mb.fqbn),
        ...portInfo,
        ...(isHiddenMatch(mb) ? { isHidden: true } : {}),
      }));
    }

    // Nothing matched. Skip ports that aren't USB devices (Bluetooth, debug
    // consoles, ...); list USB devices with no board so the user can choose.
    if (!usb.vid || !usb.pid) return [];
    return [
      {
        fqbn: "",
        name: `Unknown device (${address})`,
        ...portInfo,
        guess: true,
      },
    ];
  }

  /**
   * Fetch a board's FQBN config options (PSRAM, CPU frequency, partition
   * scheme, …) and available programmers via `arduino-cli board details`.
   */
  async boardDetails(fqbn: string): Promise<{
    fqbn: string;
    name: string;
    configOptions: Array<{
      option: string;
      optionLabel: string;
      values: Array<{ value: string; valueLabel: string; selected?: boolean }>;
    }>;
    programmers: Array<{ id: string; name: string }>;
  } | null> {
    const result = await this.executeCommand([
      "board",
      "details",
      "-b",
      fqbn,
      "--format",
      "json",
    ]);
    if (!result.success) {
      logger.error(`board details failed for ${fqbn}:`, result.error);
      return null;
    }
    try {
      const data = JSON.parse(result.output);
      const configOptions = (data.config_options || []).map((opt: any) => ({
        option: opt.option || "",
        optionLabel: opt.option_label || opt.option || "",
        values: (opt.values || []).map((v: any) => ({
          value: v.value || "",
          valueLabel: v.value_label || v.value || "",
          ...(v.selected ? { selected: true } : {}),
        })),
      }));
      const programmers = (data.programmers || []).map((p: any) => ({
        id: p.id || "",
        name: p.name || p.id || "",
      }));
      return {
        fqbn: data.fqbn || fqbn,
        name: data.name || fqbn,
        configOptions,
        programmers,
      };
    } catch (error) {
      logger.error(`Error parsing board details for ${fqbn}:`, error);
      return null;
    }
  }

  /**
   * Search the Arduino library index. Returns up to 30 matches.
   */
  async searchLibraries(query: string): Promise<
    Array<{ name: string; author: string; sentence: string; version: string }>
  > {
    const result = await this.executeCommand([
      "lib",
      "search",
      query,
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const data = JSON.parse(result.output);
      const libs = (data.libraries || []) as any[];
      return libs.slice(0, 30).map((l) => {
        const latest = l.latest || {};
        return {
          name: l.name || "",
          author: latest.author || "",
          sentence: latest.sentence || "",
          version: latest.version || "",
        };
      });
    } catch (error) {
      logger.error("Error parsing library search:", error);
      return [];
    }
  }

  /**
   * List installed libraries.
   */
  async listLibraries(): Promise<
    Array<{ name: string; author: string; sentence: string; version: string }>
  > {
    const result = await this.executeCommand([
      "lib",
      "list",
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const data = JSON.parse(result.output);
      const installed = (data.installed_libraries || []) as any[];
      return installed.map((entry) => {
        const lib = entry.library || {};
        return {
          name: lib.name || "",
          author: lib.author || "",
          sentence: lib.sentence || "",
          version: lib.version || "",
        };
      });
    } catch (error) {
      logger.error("Error parsing library list:", error);
      return [];
    }
  }

  /**
   * Install a library by name (optionally pinned to a version).
   */
  async installLibrary(
    name: string,
    version: string | undefined,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    const spec = version ? `${name}@${version}` : name;
    logger.info(`Installing library: ${spec}`);
    const opts = { idleTimeoutMs: INSTALL_IDLE_TIMEOUT_MS };
    const first = await this.executeCommand(
      ["lib", "install", spec],
      onOutput,
      opts
    );
    if (first.success || !isUnresolvableDependency(first)) return first;

    // The library lists a dependency the Library Manager index doesn't have.
    // Almost always one that ships with the board platform (Wire, SPI,
    // EEPROM…), which arduino-cli can't resolve from the index, so it refuses
    // the whole install. Install the library alone, then each dependency the
    // index does have, so a real one (Adafruit BusIO…) isn't skipped.
    const note = (text: string): void => onOutput?.(`\n${text}\n`);
    note(
      `${name} lists a dependency that isn't in the Library Manager index ` +
        `(usually one that comes with the board platform, like Wire or SPI). ` +
        `Installing ${name} without it.`
    );
    const alone = await this.executeCommand(
      ["lib", "install", "--no-deps", spec],
      onOutput,
      opts
    );
    if (!alone.success) return alone;

    const deps = libraryDependencies(
      (await this.executeCommand(["lib", "search", name, "--format", "json"])).output,
      name,
      version
    );
    const skipped: string[] = [];
    for (const dep of deps) {
      // the same way, so a dependency's own platform dependencies are handled too
      const r = await this.installLibrary(dep, undefined, onOutput);
      if (!r.success) skipped.push(dep);
    }
    const summary = skipped.length
      ? `Installed ${name}. Not in the Library Manager index, so not installed: ` +
        `${skipped.join(", ")}. Those normally come with the board platform.`
      : `Installed ${name} and its dependencies.`;
    note(summary);
    logger.info(summary);
    return {
      success: true,
      output: [first.output, alone.output, summary].filter(Boolean).join("\n"),
    };
  }

  /**
   * Uninstall a library by name.
   */
  async uninstallLibrary(
    name: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    logger.info(`Uninstalling library: ${name}`);
    return this.executeCommand(["lib", "uninstall", name], onOutput);
  }

  // ── Boards Manager: platforms (cores) ──────────────────────────────────────

  /**
   * Normalize an arduino-cli platform entry (from `core search`/`core list`)
   * into the flat PlatformInfo shape the client expects. The human-readable
   * name lives inside the release matching the latest/installed version.
   */
  private normalizePlatform(p: any): {
    id: string;
    name: string;
    installed: string;
    latest: string;
    maintainer: string;
  } {
    const installed: string = p.installed_version || "";
    const latest: string = p.latest_version || "";
    const releases = p.releases || {};
    const release =
      releases[latest] ||
      releases[installed] ||
      releases[Object.keys(releases).pop() as string] ||
      {};
    return {
      id: p.id || "",
      name: release.name || p.id || "",
      installed,
      latest,
      maintainer: p.maintainer || "",
    };
  }

  /**
   * Search the platform (core) index. Returns installable platforms, including
   * any from configured additional board-manager URLs.
   */
  async searchCores(query: string): Promise<
    Array<{ id: string; name: string; installed: string; latest: string; maintainer: string }>
  > {
    const result = await this.executeCommand([
      "core",
      "search",
      query,
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const platforms = (JSON.parse(result.output).platforms || []) as any[];
      return platforms.map((p) => this.normalizePlatform(p));
    } catch (error) {
      logger.error("Error parsing core search:", error);
      return [];
    }
  }

  /**
   * List installed platforms (cores).
   */
  async listInstalledCores(): Promise<
    Array<{ id: string; name: string; installed: string; latest: string; maintainer: string }>
  > {
    const result = await this.executeCommand([
      "core",
      "list",
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const platforms = (JSON.parse(result.output).platforms || []) as any[];
      return platforms.map((p) => this.normalizePlatform(p));
    } catch (error) {
      logger.error("Error parsing core list:", error);
      return [];
    }
  }

  /**
   * Uninstall a platform (core) by id, e.g. "esp32:esp32".
   */
  async uninstallCore(
    packageName: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    logger.info(`Uninstalling core package: ${packageName}`);
    return this.executeCommand(["core", "uninstall", packageName], onOutput, {
      idleTimeoutMs: INSTALL_IDLE_TIMEOUT_MS,
    });
  }

  /**
   * List every board (FQBN) provided by the installed platforms. This is the
   * source for the manual board-type override in the Boards Manager.
   */
  async listAllBoards(): Promise<Array<{ name: string; fqbn: string }>> {
    const result = await this.executeCommand([
      "board",
      "listall",
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const boards = (JSON.parse(result.output).boards || []) as any[];
      return boards
        .filter((b) => b.fqbn)
        .map((b) => ({ name: b.name || b.fqbn, fqbn: b.fqbn }));
    } catch (error) {
      logger.error("Error parsing board listall:", error);
      return [];
    }
  }

  // ── Boards Manager: additional board-manager URLs ──────────────────────────

  /**
   * List the configured additional board-manager URLs.
   */
  async listBoardUrls(): Promise<string[]> {
    const result = await this.executeCommand([
      "config",
      "get",
      "board_manager.additional_urls",
      "--format",
      "json",
    ]);
    if (!result.success) return [];
    try {
      const parsed = JSON.parse(result.output);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.error("Error parsing board URLs:", error);
      return [];
    }
  }

  /**
   * Remove an additional board-manager URL.
   */
  async removeBoardUrl(url: string): Promise<ArduinoCliResult> {
    logger.info(`Removing board manager URL: ${url}`);
    return this.executeCommand([
      "config",
      "remove",
      "board_manager.additional_urls",
      url,
    ]);
  }

  /**
   * Check if Arduino CLI is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.executeCommand(["version"]);
      return result.success;
    } catch (error) {
      logger.error("Arduino CLI not available:", error);
      return false;
    }
  }

  /**
   * Add additional board manager URL
   */
  async addBoardUrl(url: string): Promise<ArduinoCliResult> {
    logger.info(`Adding board manager URL: ${url}`);
    return this.executeCommand([
      "config",
      "add",
      "board_manager.additional_urls",
      url,
    ]);
  }

  /**
   * Update core index
   */
  async updateCoreIndex(
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    logger.info("Updating Arduino core index...");
    return this.executeCommand(["core", "update-index"], onOutput, {
      idleTimeoutMs: INSTALL_IDLE_TIMEOUT_MS,
    });
  }

  /**
   * Install a core package
   */
  async installCore(
    packageName: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    logger.info(`Installing core package: ${packageName}`);
    return this.executeCommand(["core", "install", packageName], onOutput, {
      idleTimeoutMs: INSTALL_IDLE_TIMEOUT_MS,
    });
  }

  /**
   * Check if a core is installed
   */
  async isCoreInstalled(packageName: string): Promise<boolean> {
    try {
      const result = await this.executeCommand([
        "core",
        "list",
        "--format",
        "json",
      ]);
      if (!result.success) {
        return false;
      }

      const coresData = JSON.parse(result.output).platforms;
      if (Array.isArray(coresData)) {
        return coresData.some((core: any) => core.id === packageName);
      }
      return false;
    } catch (error) {
      logger.error(
        `Error checking if core ${packageName} is installed:`,
        error
      );
      return false;
    }
  }

  /**
   * Read one arduino-cli setting, e.g. "directories.data". Returns the value
   * as arduino-cli prints it in JSON (string, array, ...), or undefined.
   */
  async getConfigValue(key: string): Promise<unknown> {
    const result = await this.executeCommand([
      "config",
      "get",
      key,
      "--format",
      "json",
    ]);
    if (!result.success) return undefined;
    try {
      return JSON.parse(result.output);
    } catch {
      return undefined;
    }
  }

  /** arduino-cli's data directory (where indexes and platforms live). */
  async getDataDir(): Promise<string | undefined> {
    const value = await this.getConfigValue("directories.data");
    return typeof value === "string" && value ? value : undefined;
  }

  /**
   * Execute an Arduino CLI command
   */
  /**
   * Execute an Arduino CLI command.
   *
   * `idleTimeoutMs` is a stall watchdog, not a time limit: the command is
   * stopped only after that long with no output at all. Installs of big
   * platforms legitimately run for many minutes, but they print download
   * progress the whole time.
   */
  executeCommand(
    args: string[],
    onOutput?: (data: string) => void,
    options: { idleTimeoutMs?: number } = {}
  ): Promise<ArduinoCliResult> {
    return new Promise((resolve) => {
      logger.debug(`Executing: ${this.cliPath} ${args.join(" ")}`);

      const child: ChildProcess = spawn(this.cliPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let stalled = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const armWatchdog = (): void => {
        if (!options.idleTimeoutMs) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          stalled = true;
          logger.error(
            `arduino-cli ${args.join(" ")} printed nothing for ` +
              `${Math.round(options.idleTimeoutMs! / 60000)} min; stopping it.`
          );
          child.kill();
        }, options.idleTimeoutMs);
      };
      armWatchdog();

      child.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        armWatchdog();
        if (onOutput) {
          onOutput(output);
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        armWatchdog();
        if (onOutput) {
          onOutput(output);
        }
      });

      child.on("close", (code: number) => {
        if (idleTimer) clearTimeout(idleTimer);
        if (stalled) {
          resolve({
            success: false,
            output: stdout + (stderr ? `\n${stderr}` : ""),
            error: `arduino-cli stopped responding (no output for ${Math.round(
              options.idleTimeoutMs! / 60000
            )} minutes)`,
          });
          return;
        }
        const success = code === 0;
        // Combine stdout and stderr for complete output
        const combinedOutput = stdout + (stderr ? `\n${stderr}` : "");
        const result: ArduinoCliResult = {
          success,
          output: combinedOutput || stdout,
          error: success
            ? undefined
            : stderr || `Process exited with code ${code}`,
        };

        if (!success) {
          logger.error(
            `Arduino CLI command failed: ${args.join(" ")}`,
            result.error
          );
        }

        resolve(result);
      });

      child.on("error", (error: Error) => {
        if (idleTimer) clearTimeout(idleTimer);
        logger.error("Failed to start Arduino CLI process:", error);
        resolve({
          success: false,
          output: "",
          error: error.message,
        });
      });
    });
  }
}

/** "0x303A" / "303a" -> "0x303a"; "" when missing. */
export function normalizeUsbId(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{1,4}$/.test(raw) ? `0x${raw.padStart(4, "0")}` : "";
}

function isHiddenMatch(mb: any): boolean {
  return Boolean(mb?.is_hidden ?? mb?.isHidden);
}

/**
 * Whether a failed `lib install` failed only because a dependency couldn't be
 * resolved from the library index: arduino-cli's
 * "No valid dependencies solution found: dependency 'Wire' is not available".
 */
export function isUnresolvableDependency(result: ArduinoCliResult): boolean {
  return /No valid dependencies solution found/i.test(
    `${result.error ?? ""}\n${result.output ?? ""}`
  );
}

/**
 * The dependency names `name` declares, from `lib search <name> --format json`
 * output: from the given version's release when it's listed, else the latest.
 * Unparseable output, or a library that isn't in it, gives no dependencies.
 */
export function libraryDependencies(
  searchJson: string,
  name: string,
  version?: string
): string[] {
  let data: any;
  try {
    data = JSON.parse(searchJson);
  } catch {
    return [];
  }
  const lib = ((data?.libraries ?? []) as any[]).find((l) => l?.name === name);
  if (!lib) return [];
  const release = (version && lib.releases?.[version]) || lib.latest || {};
  const deps = (release.dependencies ?? []) as Array<{ name?: string }>;
  return [...new Set(deps.map((d) => d?.name ?? "").filter((n) => n && n !== name))];
}
