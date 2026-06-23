# Using TinyService in Electron

This guide explains how to integrate TinyService into an Electron application.

## Installation

```bash
npm install @mister-industries/tinyservice
# or
yarn add @mister-industries/tinyservice
```

## Arduino CLI Binaries

The package includes arduino-cli binaries for all platforms in the `binaries/` directory:

- `binaries/macos-x64/arduino-cli` - macOS Intel
- `binaries/macos-arm64/arduino-cli` - macOS Apple Silicon
- `binaries/linux-x64/arduino-cli` - Linux x64
- `binaries/linux-arm64/arduino-cli` - Linux ARM64
- `binaries/windows-x64/arduino-cli.exe` - Windows x64

## Electron Configuration

### 1. Configure electron-builder

Add the arduino-cli binaries as extra resources in your `electron-builder` configuration:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "node_modules/@mister-industries/tinyservice/binaries/macos-x64",
        "to": "arduino-cli/macos-x64",
        "filter": ["**/*"],
        "platform": "darwin"
      },
      {
        "from": "node_modules/@mister-industries/tinyservice/binaries/macos-arm64",
        "to": "arduino-cli/macos-arm64",
        "filter": ["**/*"],
        "platform": "darwin"
      },
      {
        "from": "node_modules/@mister-industries/tinyservice/binaries/linux-x64",
        "to": "arduino-cli/linux-x64",
        "filter": ["**/*"],
        "platform": "linux"
      },
      {
        "from": "node_modules/@mister-industries/tinyservice/binaries/linux-arm64",
        "to": "arduino-cli/linux-arm64",
        "filter": ["**/*"],
        "platform": "linux"
      },
      {
        "from": "node_modules/@mister-industries/tinyservice/binaries/windows-x64",
        "to": "arduino-cli/windows-x64",
        "filter": ["**/*"],
        "platform": "win32"
      }
    ]
  }
}
```

### 2. Main Process Integration

Create a service manager in your Electron main process:

```typescript
import { app } from "electron";
import { TinyService } from "@mister-industries/tinyservice";
import { join } from "path";

class ServiceManager {
  private service: TinyService | null = null;

  async start() {
    const arduinoCliPath = this.getArduinoCliPath();

    this.service = new TinyService({
      port: 3000,
      arduinoCliPath,
      allowedOrigins: ["*"],
    });

    await this.service.start();
    console.log("TinyService started successfully");
  }

  async stop() {
    if (this.service) {
      await this.service.stop();
      console.log("TinyService stopped");
    }
  }

  private getArduinoCliPath(): string {
    // In development, use system arduino-cli
    if (!app.isPackaged) {
      return "arduino-cli";
    }

    // In production, use bundled binary
    const platform = process.platform;
    const arch = process.arch;

    let binaryPath: string;

    if (platform === "darwin") {
      const dir = arch === "arm64" ? "macos-arm64" : "macos-x64";
      binaryPath = join(
        process.resourcesPath,
        "arduino-cli",
        dir,
        "arduino-cli",
      );
    } else if (platform === "linux") {
      const dir = arch === "arm64" ? "linux-arm64" : "linux-x64";
      binaryPath = join(
        process.resourcesPath,
        "arduino-cli",
        dir,
        "arduino-cli",
      );
    } else if (platform === "win32") {
      binaryPath = join(
        process.resourcesPath,
        "arduino-cli",
        "windows-x64",
        "arduino-cli.exe",
      );
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return binaryPath;
  }
}

// Export singleton instance
export const serviceManager = new ServiceManager();

// Start service when app is ready
app.whenReady().then(async () => {
  await serviceManager.start();
});

// Stop service when app is quitting
app.on("before-quit", async () => {
  await serviceManager.stop();
});
```

### 3. Connect from Renderer Process

Your renderer process can connect to the WebSocket service:

```typescript
import { TinyServiceClient } from "@mister-industries/shared";

const client = new TinyServiceClient("ws://localhost:3000");

client.on("connect", () => {
  console.log("Connected to TinyService");
});

// Compile Arduino sketch
client.compile({
  sketch: "/path/to/sketch.ino",
  board: "arduino:avr:uno",
});

// Listen for output
client.on("output", (data) => {
  console.log(data.text);
});
```

## Development vs Production

**Development Mode:**

- Service runs from `node_modules` without packaging
- Uses system arduino-cli (must be installed separately)
- Fast iteration, no build step needed

**Production Mode:**

- Service bundled with arduino-cli binaries
- Self-contained, no external dependencies
- Binaries selected based on platform

## Configuration Options

```typescript
interface ServiceConfig {
  port: number; // WebSocket server port (default: 3000)
  arduinoCliPath: string; // Path to arduino-cli binary
  allowedOrigins: string[]; // CORS allowed origins
}
```

## Platform Support

- ✅ macOS (Intel & Apple Silicon)
- ✅ Windows (x64)
- ✅ Linux (x64 & ARM64)

## Troubleshooting

### Arduino CLI not found

Make sure the binary path is correct and the file has executable permissions on Unix systems.

### Port already in use

Change the port in the configuration or ensure no other service is using port 3000.

### WebSocket connection refused

Verify the service started successfully by checking the console logs.
