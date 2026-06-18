import { ChildProcess, spawn } from "child_process";
import { config, logger } from "../config.js";
import type { ArduinoCliResult, BoardInfo } from "../types/messages.types.js";

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

  private readonly tinyCoreFqbn = "tinyCore:esp32:tiny_core_esp32s3_nopsram";

  /**
   * Identify a board from its USB VID/PID when arduino-cli has no matching core
   * definition for the port (e.g. CH340/CP210x clones, or before the tinyCore
   * platform is installed). Returns a best-guess FQBN + name, or null.
   */
  private identifyByUsb(
    vidRaw: string,
    pidRaw: string
  ): { fqbn: string; name: string } | null {
    const vid = vidRaw.toUpperCase().replace(/^0X/, "");
    const pid = pidRaw.toUpperCase().replace(/^0X/, "");
    // Espressif native USB (ESP32-S3, incl. tinyCore)
    if (vid === "303A")
      return { fqbn: this.tinyCoreFqbn, name: "tinyCore (ESP32-S3)" };
    // Genuine Arduino Uno
    if (
      (vid === "2341" || vid === "2A03") &&
      ["0043", "0001", "0243", "006A"].includes(pid)
    )
      return { fqbn: "arduino:avr:uno", name: "Arduino Uno" };
    // CH340 serial bridge — overwhelmingly an Uno clone in this ecosystem
    if (vid === "1A86" && (pid === "7523" || pid === "5523"))
      return { fqbn: "arduino:avr:uno", name: "Arduino Uno (CH340)" };
    // CP210x serial bridge — board type unknown, let the user choose
    if (vid === "10C4" && pid === "EA60")
      return { fqbn: "", name: "Serial device (CP210x)" };
    return null;
  }

  /**
   * List connected boards. Includes ports arduino-cli can identify outright
   * (matching_boards) AND USB serial ports it can't (CH340/CP210x clones),
   * matched heuristically by VID/PID so they're still selectable.
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
          const address: string | undefined = port.port?.address || undefined;
          if (!address) continue;

          if (port.matching_boards && port.matching_boards.length > 0) {
            // Prioritize tinyCore boards over generic esp32 boards when a port
            // matches multiple cores.
            const tinyCoreBoard = port.matching_boards.find((mb: any) =>
              mb.fqbn.startsWith("tinyCore:")
            );
            if (tinyCoreBoard) {
              boards.push({
                fqbn: tinyCoreBoard.fqbn,
                name: tinyCoreBoard.name,
                port: address,
              });
            } else {
              for (const matchingBoard of port.matching_boards) {
                boards.push({
                  fqbn: matchingBoard.fqbn,
                  name: matchingBoard.name,
                  port: address,
                });
              }
            }
            continue;
          }

          // No core matched — fall back to USB VID/PID identification so clone
          // boards (very common for the Uno) are still offered to the user.
          const props = port.port?.properties || {};
          const vid: string = props.vid || props.VID || "";
          const pid: string = props.pid || props.PID || "";
          if (!vid || !pid) continue; // skip non-USB ports (Bluetooth, AMT, …)

          const guess = this.identifyByUsb(vid, pid);
          boards.push({
            fqbn: guess?.fqbn || "",
            name: guess?.name || `Serial device (${address})`,
            port: address,
          });
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
    return this.executeCommand(["lib", "install", spec], onOutput);
  }

  /**
   * Uninstall a library by name.
   */
  async uninstallLibrary(name: string): Promise<ArduinoCliResult> {
    logger.info(`Uninstalling library: ${name}`);
    return this.executeCommand(["lib", "uninstall", name]);
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
  async updateCoreIndex(): Promise<ArduinoCliResult> {
    logger.info("Updating Arduino core index...");
    return this.executeCommand(["core", "update-index"]);
  }

  /**
   * Install a core package
   */
  async installCore(
    packageName: string,
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    logger.info(`Installing core package: ${packageName}`);
    return this.executeCommand(["core", "install", packageName], onOutput);
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
   * Initialize board packages for tinyCore
   * Adds the board manager URL and installs required cores
   */
  async initializeTinyCoreBoards(
    onOutput?: (data: string) => void
  ): Promise<boolean> {
    try {
      logger.info("Initializing tinyCore board support...");

      // Add tinyCore board manager URL
      const tinyCoreUrl =
        "https://raw.githubusercontent.com/Mister-Industries/arduino-board-index/refs/heads/main/package_tiny_core_index.json";

      logger.info("Adding tinyCore board manager URL...");
      await this.addBoardUrl(tinyCoreUrl);

      // Update core index
      logger.info("Updating core index...");
      const updateResult = await this.updateCoreIndex();
      if (!updateResult.success) {
        logger.error("Failed to update core index:", updateResult.error);
        return false;
      }

      // Install ESP32 package by Espressif (required dependency)
      const esp32Package = "esp32:esp32";
      const esp32Installed = await this.isCoreInstalled(esp32Package);

      if (!esp32Installed) {
        logger.info("Installing ESP32 package by Espressif...");
        if (onOutput) onOutput("Installing ESP32 package by Espressif...\n");

        const esp32Result = await this.installCore(esp32Package, onOutput);
        if (!esp32Result.success) {
          logger.error("Failed to install ESP32 package:", esp32Result.error);
          return false;
        }
        logger.info("ESP32 package installed successfully");
      } else {
        logger.info("ESP32 package already installed");
      }

      // Install tinyCore ESP32 Boards by mr.industries
      const tinyCorePackage = "tinyCore:esp32";
      const tinyCoreInstalled = await this.isCoreInstalled(tinyCorePackage);

      if (!tinyCoreInstalled) {
        logger.info("Installing tinyCore ESP32 Boards by mr.industries...");
        if (onOutput)
          onOutput("Installing tinyCore ESP32 Boards by mr.industries...\n");

        const tinyCoreResult = await this.installCore(
          tinyCorePackage,
          onOutput
        );
        if (!tinyCoreResult.success) {
          logger.error(
            "Failed to install tinyCore package:",
            tinyCoreResult.error
          );
          return false;
        }
        logger.info("tinyCore ESP32 Boards installed successfully");
      } else {
        logger.info("tinyCore ESP32 Boards already installed");
      }

      logger.info("✓ tinyCore board support initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize tinyCore boards:", error);
      return false;
    }
  }

  /**
   * Execute an Arduino CLI command
   */
  private executeCommand(
    args: string[],
    onOutput?: (data: string) => void
  ): Promise<ArduinoCliResult> {
    return new Promise((resolve) => {
      logger.debug(`Executing: ${this.cliPath} ${args.join(" ")}`);

      const child: ChildProcess = spawn(this.cliPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        if (onOutput) {
          onOutput(output);
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        if (onOutput) {
          onOutput(output);
        }
      });

      child.on("close", (code: number) => {
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
