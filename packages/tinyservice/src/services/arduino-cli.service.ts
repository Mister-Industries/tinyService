import { ChildProcess, spawn } from "child_process";
import { logger } from "../config.js";
import type { ArduinoCliResult, BoardInfo } from "../types/messages.types.js";

export class ArduinoCliService {
  private readonly cliPath: string;

  constructor(arduinoCliPath: string) {
    this.cliPath = arduinoCliPath;
  }

  /**
   * Compile an Arduino sketch
   */
  async compile(
    sketchPath: string,
    board: string,
    onOutput?: (data: string) => void,
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["compile", "--fqbn", board, sketchPath],
      onOutput,
    );
  }

  /**
   * Upload a compiled sketch to the board
   */
  async upload(
    sketchPath: string,
    board: string,
    port: string,
    onOutput?: (data: string) => void,
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["upload", "--fqbn", board, "--port", port, sketchPath],
      onOutput,
    );
  }

  /**
   * Verify (compile without uploading) an Arduino sketch
   */
  async verify(
    sketchPath: string,
    board: string,
    onOutput?: (data: string) => void,
  ): Promise<ArduinoCliResult> {
    return this.executeCommand(
      ["compile", "--verify", "--fqbn", board, sketchPath],
      onOutput,
    );
  }

  /**
   * List connected boards
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
          if (port.matching_boards && port.matching_boards.length > 0) {
            // Prioritize tinyCore boards over generic esp32 boards
            // If multiple matching boards exist for the same port, prefer tinyCore
            const tinyCoreBoard = port.matching_boards.find((mb: any) =>
              mb.fqbn.startsWith("tinyCore:"),
            );

            if (tinyCoreBoard) {
              // Use tinyCore board if available
              boards.push({
                fqbn: tinyCoreBoard.fqbn,
                name: tinyCoreBoard.name,
                port: port.port?.address || undefined,
              });
            } else {
              // Otherwise, add all matching boards
              for (const matchingBoard of port.matching_boards) {
                boards.push({
                  fqbn: matchingBoard.fqbn,
                  name: matchingBoard.name,
                  port: port?.port.address || undefined,
                });
              }
            }
          }
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
    onOutput?: (data: string) => void,
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
        error,
      );
      return false;
    }
  }

  /**
   * Initialize board packages for tinyCore
   * Adds the board manager URL and installs required cores
   */
  async initializeTinyCoreBoards(
    onOutput?: (data: string) => void,
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
          onOutput,
        );
        if (!tinyCoreResult.success) {
          logger.error(
            "Failed to install tinyCore package:",
            tinyCoreResult.error,
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
    onOutput?: (data: string) => void,
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
            result.error,
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
