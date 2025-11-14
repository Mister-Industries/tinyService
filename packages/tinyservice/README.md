# Arduino WebSocket Service

A Node.js TypeScript WebSocket service for compiling and uploading Arduino projects using Arduino CLI.

## Features

- **WebSocket Server**: Real-time communication with clients
- **Arduino CLI Integration**: Compile, upload, and verify Arduino sketches
- **Board Detection**: List connected Arduino boards
- **Real-time Output Streaming**: See compilation/upload progress in real-time
- **Multi-client Support**: Handle multiple WebSocket connections simultaneously
- **Health Check**: HTTP endpoint for service monitoring
- **Graceful Shutdown**: Proper cleanup on service termination

## Prerequisites

### Arduino CLI Installation

1. **Download Arduino CLI**:
   - Visit [Arduino CLI releases](https://github.com/arduino/arduino-cli/releases)
   - Download the appropriate version for your system
   - Extract and place the binary in your PATH

2. **Alternative Installation Methods**:

   **Windows (using Chocolatey)**:

   ```powershell
   choco install arduino-cli
   ```

   **macOS (using Homebrew)**:

   ```bash
   brew install arduino-cli
   ```

   **Linux (using curl)**:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
   ```

3. **Initialize Arduino CLI**:
   ```bash
   arduino-cli core update-index
   arduino-cli core install arduino:avr  # For Arduino Uno, Nano, etc.
   ```

### Node.js

- Node.js 16.x or higher
- npm or yarn package manager

## Installation

From the monorepo root:

```bash
npm install
```

Or from this package directory:

```bash
cd packages/service
npm install
```

## Usage

### Development Mode

From monorepo root:

```bash
npm run dev:server
```

From this package:

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues automatically

## API Documentation

See [API.md](./docs/API.md) for detailed API documentation.

## Testing

See [TEST_CLIENT.md](./docs/TEST_CLIENT.md) for testing instructions.

## Environment Variables

| Variable           | Default       | Description                    |
| ------------------ | ------------- | ------------------------------ |
| `PORT`             | `3000`        | Server port                    |
| `ARDUINO_CLI_PATH` | `arduino-cli` | Path to Arduino CLI executable |
| `NODE_ENV`         | `development` | Environment mode               |

## License

MIT
