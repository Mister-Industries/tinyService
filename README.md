# TinyService Monorepo

A monorepo containing an Arduino WebSocket service and a web client for compiling and uploading Arduino projects.

## Quickstart

1. Clone the repo
2. Open the repo in vscode
3. Open the terminal
4. Run `npm install`
6. Copy `packages/service/.env.example` into a new file named `packages/service/.env`
6. Hit `Ctrl+Shift+P` and type "run task" then select "Tasks: Run Task"
7. Then select "Start Dev Environment"
8. Open your browser to [localhost:5173](http://localhost:5173) to use the test bench

## 📦 Packages

### [`packages/service`](./packages/service)

Node.js TypeScript WebSocket service for compiling and uploading Arduino projects using Arduino CLI.

**Features:**

- WebSocket Server for real-time communication
- Arduino CLI Integration
- Board Detection
- Real-time Output Streaming
- Multi-client Support
- Health Check endpoint

### [`packages/client`](./packages/client)

React + TypeScript web client built with Vite for interacting with the Arduino WebSocket service.

**Features:**

- Modern React UI
- WebSocket integration
- Real-time compilation feedback
- Board management interface

## 🚀 Quick Start

### Prerequisites

#### Arduino CLI Installation

1. **Download Arduino CLI**:

   - Visit [Arduino CLI releases](https://github.com/arduino/arduino-cli/releases)
   - Download the appropriate version for your system
   - Extract and place the binary in your PATH

2. **Alternative Installation Methods**:

   **Windows (using Chocolatey)**:

   ```
   choco install arduino-cli
   ```

   **macOS (using Homebrew)**:

   ```
   brew install arduino-cli
   ```

   **Linux (using curl)**:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
   ```

3. **Initialize Arduino CLI**:

   ```bash
   arduino-cli core update-index
   arduino-cli core install arduino:avr # For Arduino Uno, Nano, etc.
   ```

#### Node.js

- Node.js 16.x or higher
- npm 7.x or higher (for workspace support)

## 📥 Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd tinyService
   ```

2. **Install all dependencies**:

   ```bash
   npm install
   ```

   This will install dependencies for all packages in the monorepo.

3. **Configuration**:

   Create a `.env` file in `packages/service` directory (optional):

```txt
 PORT=3000
 ARDUINO_CLI_PATH=arduino-cli
 NODE_ENV=development
```

## 🛠️ Usage

### Development Mode

**Run both server and client:**

```bash
npm run dev
```

**Run server only:**

```bash
npm run dev:server
```

**Run client only:**

```bash
npm run dev:client
```

### Production Mode

**Build all packages:**

```bash
npm run build
```

**Build specific package:**

```bash
npm run build:server
npm run build:client
```

**Start production server:**

```bash
npm run start:server
```

### Available Scripts

From the root directory:

- `npm run dev` - Start both server and client in development mode
- `npm run dev:server` - Start server only
- `npm run dev:client` - Start client only
- `npm run build` - Build all packages
- `npm run build:server` - Build server package
- `npm run build:client` - Build client package
- `npm run start:server` - Start production server
- `npm run lint` - Lint all packages
- `npm run lint:fix` - Fix linting issues in all packages

## 📚 Package Documentation

For detailed documentation on each package, see:

- [Server Documentation](./packages/service/README.md)
- [Client Documentation](./packages/client/README.md) (coming soon)

## 🏗️ Monorepo Structure

```
tinyService/
├── packages/
│   ├── service/          # Arduino WebSocket service
│   │   ├── src/
│   │   ├── docs/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   ├── client/          # React + Vite Web Client
│   │   ├── src/
│   │   ├── package.json
│   │   └── README.md
│   └── shared/          # Messaging npm package
│
├── package.json         # Root workspace configuration
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 🔧 Development

### Adding New Packages

To add a new package to the monorepo:

1. Create a new directory in `packages/`
2. Initialize with `npm init` or copy an existing `package.json`
3. The workspace will automatically pick it up

### Working with Workspaces

Run commands in specific packages:

```bash
# Run a script in a specific package
npm run <script> --workspace=packages/service

# Install a dependency in a specific package
npm install <package> --workspace=packages/service
```

## 📖 API Documentation

For detailed API documentation, see:

- [Server API Documentation](./packages/service/docs/API.md)
- [WebSocket Protocol](./packages/service/docs/API.md#websocket-message-protocol)

## API Endpoints

### HTTP Endpoints

- **GET /** - Service information and available actions
- **GET /health** - Health check endpoint

### WebSocket Endpoint

- **ws://localhost:3000** - WebSocket connection endpoint

## WebSocket Message Protocol

### Incoming Messages (Client → Server)

All messages follow this structure:

```json
{
  "action": "compile" | "upload" | "list-boards" | "verify",
  "payload": {
    "sketchPath": "string",
    "board": "string",
    "port": "string (optional, required for upload)"
  }
}
```

#### Incoming Message Examples

**Compile a sketch**:

```json
{
  "action": "compile",
  "payload": {
    "sketchPath": "/path/to/sketch.ino",
    "board": "arduino:avr:uno"
  }
}
```

**Upload to board**:

```json
{
  "action": "upload",
  "payload": {
    "sketchPath": "/path/to/sketch.ino",
    "board": "arduino:avr:uno",
    "port": "/dev/ttyUSB0"
  }
}
```

**List connected boards**:

```json
{
  "action": "list-boards",
  "payload": {}
}
```

**Verify sketch (compile without upload)**:

```json
{
  "action": "verify",
  "payload": {
    "sketchPath": "/path/to/sketch.ino",
    "board": "arduino:avr:uno"
  }
}
```

### Outgoing Messages (Server → Client)

All messages follow this structure:

```json
{
  "type": "status" | "output" | "error" | "complete",
  "action": "string",
  "data": "any"
}
```

#### Message Types

- **status**: Operation status updates
- **output**: Real-time compilation/upload output
- **error**: Error messages
- **complete**: Operation completed successfully

#### Outgoing Message Examples

**Status update**:

```json
{
  "type": "status",
  "action": "compile",
  "data": {
    "message": "Starting compilation...",
    "sketchPath": "/path/to/sketch.ino",
    "board": "arduino:avr:uno"
  }
}
```

**Real-time output**:

```json
{
  "type": "output",
  "action": "compile",
  "data": {
    "output": "Compiling sketch..."
  }
}
```

**Completion**:

```json
{
  "type": "complete",
  "action": "compile",
  "data": {
    "message": "Compilation completed successfully",
    "sketchPath": "/path/to/sketch.ino",
    "board": "arduino:avr:uno",
    "output": "Full compilation output..."
  }
}
```

**Error**:

```json
{
  "type": "error",
  "action": "compile",
  "data": {
    "error": "Compilation failed: Missing library"
  }
}
```

## 🧪 Testing

See individual package documentation for testing instructions:

- [Server Testing](./packages/service/docs/TEST_CLIENT.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## 📝 License

MIT - See [LICENSE](./LICENSE) for details.

## Testing with wscat

Install wscat for testing WebSocket connections:

```bash
npm install -g wscat
```

### Example Test Session

1. **Connect to the WebSocket server**:

   ```bash
   wscat -c ws://localhost:3000
   ```

2. **List connected boards**:

   ```json
   { "action": "list-boards", "payload": {} }
   ```

3. **Compile a sketch**:

   ```json
   {
     "action": "compile",
     "payload": {
       "sketchPath": "C:\\path\\to\\sketch\\sketch.ino",
       "board": "arduino:avr:uno"
     }
   }
   ```

4. **Upload to a board**:

   ```json
   {
     "action": "upload",
     "payload": {
       "sketchPath": "C:\\path\\to\\sketch\\sketch.ino",
       "board": "arduino:avr:uno",
       "port": "COM3"
     }
   }
   ```

## Board FQBN (Fully Qualified Board Name) Examples

Common Arduino board FQBNs:

- Arduino Uno: `arduino:avr:uno`
- Arduino Nano: `arduino:avr:nano`
- Arduino Mega: `arduino:avr:mega`
- Arduino Leonardo: `arduino:avr:leonardo`
- ESP32: `esp32:esp32:esp32`
- ESP8266: `esp8266:esp8266:nodemcuv2`

To find the FQBN for your board:

```bash
arduino-cli board list
```

## Project Structure

```
src/
├── handlers/
│   ├── compile.handler.ts    # Handle compile requests
│   ├── upload.handler.ts     # Handle upload requests
│   └── boards.handler.ts     # Handle board detection
├── services/
│   ├── arduino-cli.service.ts # Arduino CLI wrapper
│   └── websocket.service.ts   # WebSocket server logic
├── types/
│   └── messages.types.ts      # TypeScript interfaces
├── config.ts                  # Configuration management
└── server.ts                  # Main entry point
```

## Environment Variables

| Variable           | Default       | Description                    |
| ------------------ | ------------- | ------------------------------ |
| `PORT`             | `3000`        | Server port                    |
| `ARDUINO_CLI_PATH` | `arduino-cli` | Path to Arduino CLI executable |
| `NODE_ENV`         | `development` | Environment mode               |

## Error Handling

The service includes comprehensive error handling:

- **Invalid WebSocket messages**: Returns error message to client
- **Missing Arduino CLI**: Logs warning but continues running
- **Compilation failures**: Streams error output to client
- **Connection errors**: Automatic cleanup and logging

## Logging

The service uses structured logging with different levels:

- **INFO**: General information and successful operations
- **ERROR**: Error conditions and failures
- **WARN**: Warning conditions
- **DEBUG**: Detailed debugging information (development mode only)

## Development

### Adding New Actions

1. Create a new handler in `src/handlers/`
2. Add the action type to `IncomingMessage` interface
3. Register the handler in `WebSocketService`
4. Update the Arduino CLI service if needed

### Code Style

The project uses ESLint with TypeScript rules. Run `npm run lint` to check code style.

## Troubleshooting

### Common Issues

1. **"Arduino CLI not found"**:

   - Ensure Arduino CLI is installed and in PATH
   - Set `ARDUINO_CLI_PATH` environment variable if installed in custom location

2. **"Permission denied" on Linux/macOS**:

   - Add user to dialout group: `sudo usermod -a -G dialout $USER`
   - Logout and login again

3. **WebSocket connection refused**:

   - Check if server is running on correct port
   - Verify firewall settings

4. **Compilation fails**:
   - Ensure correct board FQBN
   - Install required board packages: `arduino-cli core install <package>`
   - Check sketch syntax

### Getting Help

- Check the health endpoint: `http://localhost:3000/health`
- Review server logs for detailed error information
- Ensure Arduino CLI works independently: `arduino-cli version`

```

```
