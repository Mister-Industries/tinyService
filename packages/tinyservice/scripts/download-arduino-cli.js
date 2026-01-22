#!/usr/bin/env node

/**
 * Download Arduino CLI binaries for all platforms
 * This script is run during the build process to bundle arduino-cli with the package
 */

import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "fs";
import https from "https";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARDUINO_CLI_VERSION = "1.4.1";
const BASE_URL = `https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}`;

const PLATFORMS = [
  {
    name: "darwin-amd64",
    filename: `arduino-cli_${ARDUINO_CLI_VERSION}_macOS_64bit.tar.gz`,
    outputDir: "macos-x64",
    executable: "arduino-cli",
  },
  {
    name: "darwin-arm64",
    filename: `arduino-cli_${ARDUINO_CLI_VERSION}_macOS_ARM64.tar.gz`,
    outputDir: "macos-arm64",
    executable: "arduino-cli",
  },
  {
    name: "linux-amd64",
    filename: `arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz`,
    outputDir: "linux-x64",
    executable: "arduino-cli",
  },
  {
    name: "linux-arm64",
    filename: `arduino-cli_${ARDUINO_CLI_VERSION}_Linux_ARM64.tar.gz`,
    outputDir: "linux-arm64",
    executable: "arduino-cli",
  },
  {
    name: "win32-amd64",
    filename: `arduino-cli_${ARDUINO_CLI_VERSION}_Windows_64bit.zip`,
    outputDir: "windows-x64",
    executable: "arduino-cli.exe",
    isZip: true,
  },
];

const binariesDir = join(__dirname, "..", "binaries");

async function download(url, outputPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          return download(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const fileStream = createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });

        fileStream.on("error", (err) => {
          reject(err);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

async function extractTarGz(archivePath, outputDir) {
  const tar = await import("tar");
  await tar.extract({
    file: archivePath,
    cwd: outputDir,
    filter: (path) => path.includes("arduino-cli") && !path.includes("/"),
  });
}

async function extractZip(archivePath, outputDir) {
  // For Windows, we'll use extract-zip package
  const extractZip = (await import("extract-zip")).default;
  await extractZip(archivePath, { dir: outputDir });
}

async function downloadAndExtract(platform) {
  const url = `${BASE_URL}/${platform.filename}`;
  const platformDir = join(binariesDir, platform.outputDir);
  const archivePath = join(binariesDir, platform.filename);
  const executablePath = join(platformDir, platform.executable);

  // Check if already downloaded
  if (existsSync(executablePath)) {
    console.log(`✓ ${platform.name} already exists, skipping...`);
    return;
  }

  console.log(`Downloading ${platform.name}...`);
  console.log(`  URL: ${url}`);

  // Create directories
  if (!existsSync(binariesDir)) {
    mkdirSync(binariesDir, { recursive: true });
  }
  if (!existsSync(platformDir)) {
    mkdirSync(platformDir, { recursive: true });
  }

  try {
    // Download archive
    await download(url, archivePath);
    console.log(`  Downloaded to ${archivePath}`);

    // Extract archive
    if (platform.isZip) {
      console.log(`  Extracting zip...`);
      await extractZip(archivePath, platformDir);
    } else {
      console.log(`  Extracting tar.gz...`);
      await extractTarGz(archivePath, platformDir);
    }

    // Make executable (Unix-like systems)
    if (!platform.isZip) {
      chmodSync(executablePath, 0o755);
    }

    console.log(`✓ ${platform.name} installed successfully`);

    // Clean up archive
    unlinkSync(archivePath);
  } catch (error) {
    console.error(`✗ Failed to download ${platform.name}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log(
    `\n📦 Downloading Arduino CLI v${ARDUINO_CLI_VERSION} for all platforms...\n`,
  );

  try {
    for (const platform of PLATFORMS) {
      await downloadAndExtract(platform);
    }

    console.log("\n✓ All Arduino CLI binaries downloaded successfully!\n");
    console.log("Binaries location:", binariesDir);
  } catch (error) {
    console.error("\n✗ Failed to download Arduino CLI binaries:", error);
    process.exit(1);
  }
}

main();
