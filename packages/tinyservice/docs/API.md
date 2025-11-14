# TinyService WebSocket API

## Summary

### Problem

Developing Arduino applications requires compiling sketches and uploading them to hardware boards. Traditional Arduino IDE workflows are manual and don't integrate well with modern web-based development environments. Developers need a way to programmatically compile, verify, and upload Arduino code from their own applications without requiring users to switch between tools.

### Solution

TinyService provides a WebSocket-based API that wraps the Arduino CLI tool, enabling real-time communication between client applications and Arduino hardware. The service handles compilation, verification, uploading, and board detection through a simple message-based protocol. Clients send action requests and receive streaming updates as operations progress, making it easy to build custom Arduino development interfaces.

## Technical Implementation

### Architecture Overview

TinyService is built on Node.js with Express for HTTP endpoints and the `ws` library for WebSocket communication. The service acts as a bridge between client applications and the Arduino CLI command-line tool.

**Key Components:**

- **WebSocketService**: Manages WebSocket connections, routes incoming messages to handlers, and maintains connection health through heartbeat pings
- **Handler Classes**: Execute specific operations (CompileHandler, UploadHandler, BoardsHandler) and stream results back to clients
- **ArduinoCliService**: Spawns Arduino CLI child processes and captures real-time output
- **MessageValidator**: Validates incoming and outgoing messages to ensure protocol compliance

### WebSocket Endpoint

**Connection URL:** `ws://localhost:<port>` (default port: 3000)

The service accepts WebSocket connections and assigns each connection a unique UUID for tracking and logging purposes.

### Message Protocol

All communication uses JSON messages with a consistent structure.

**Incoming Messages (Client → Server):**

```typescript
{
  action: "compile" | "upload" | "verify" | "list-boards" | "install-cores",
  payload: {
    sketchPath?: string,  // Absolute path to .ino file
    board?: string,       // FQBN (Fully Qualified Board Name)
    port?: string         // Serial port (required for upload)
  }
}
```

**Outgoing Messages (Server → Client):**

```typescript
{
  type: "status" | "output" | "error" | "complete",
  action: string,  // Echo of the original action
  data: any        // Type-specific payload
}
```

### Available Actions

#### Compile Action

Compiles an Arduino sketch for a specific board without uploading.

**Required Payload Fields:**

- `sketchPath`: Absolute path to the sketch directory or .ino file
- `board`: FQBN format (e.g., `tinyCore:esp32:tinyS3`)

**Arduino CLI Command:** `arduino-cli compile --verbose --fqbn <board> <sketchPath>`

**Response Flow:**

1. Status message with compilation start confirmation
2. Multiple output messages streaming compilation progress
3. Complete message on success or error message on failure

#### Upload Action

Compiles (if needed) and uploads a sketch to a connected board.

**Required Payload Fields:**

- `sketchPath`: Absolute path to the sketch
- `board`: FQBN format
- `port`: Serial port identifier (e.g., `/dev/ttyUSB0`, `COM3`)

**Arduino CLI Command:** `arduino-cli upload --fqbn <board> --port <port> <sketchPath>`

**Response Flow:**

1. Status message indicating upload start
2. Output messages showing upload progress (percentage, bytes written)
3. Complete message on success or error message on failure

#### Verify Action

Verifies a sketch by compiling it with the verify flag (similar to compile but with additional checks).

**Required Payload Fields:**

- `sketchPath`: Absolute path to the sketch
- `board`: FQBN format

**Arduino CLI Command:** `arduino-cli compile --verify --fqbn <board> <sketchPath>`

**Response Flow:**

Same as compile action but with `action: "verify"`

#### List Boards Action

Scans for and lists all Arduino-compatible boards connected to the system.

**Required Payload Fields:** None (empty payload object is acceptable)

**Arduino CLI Command:** `arduino-cli board list --format json`

**Response Flow:**

1. Status message indicating scan has started
2. Complete message with array of detected boards

**Board Priority:** When multiple board definitions match a single port, the service prioritizes tinyCore boards (FQBN starting with `tinyCore:`) over generic boards.

#### Install Cores Action

Installs required board support packages for tinyCore boards. This is typically a one-time setup operation.

**Required Payload Fields:** None

**Installation Steps:**

1. Adds tinyCore board manager URL to Arduino CLI config
2. Updates the core package index
3. Installs `esp32:esp32` package (Espressif ESP32 support)
4. Installs `tinyCore:esp32` package (mr.industries custom boards)

**Response Flow:**

1. Status message indicating installation start
2. Multiple output messages showing package download and installation progress
3. Complete message when all cores are installed

### Message Types

#### Status Messages

Sent when an operation begins or reaches a milestone.

```json
{
  "type": "status",
  "action": "compile",
  "data": {
    "message": "Starting compilation...",
    "sketchPath": "/path/to/sketch.ino",
    "board": "tinyCore:esp32:tinyS3"
  }
}
```

#### Output Messages

Stream real-time output from Arduino CLI as operations execute. Clients can display these to users for transparency.

```json
{
  "type": "output",
  "action": "compile",
  "data": {
    "output": "Sketch uses 234567 bytes (18%) of program storage space..."
  }
}
```

#### Error Messages

Sent when an operation fails or validation errors occur.

```json
{
  "type": "error",
  "action": "upload",
  "data": {
    "error": "Upload failed: no serial port found",
    "output": "Detailed error output from Arduino CLI..."
  }
}
```

#### Complete Messages

Indicate successful completion of an operation.

```json
{
  "type": "complete",
  "action": "compile",
  "data": {
    "success": true,
    "message": "Compilation completed successfully",
    "sketchPath": "/path/to/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "output": "Full compilation output..."
  }
}
```

### HTTP Endpoints

While the primary interface is WebSocket-based, TinyService provides HTTP endpoints for service information and health checks.

#### GET /

Returns service metadata and available actions.

```json
{
  "name": "TinyService",
  "version": "1.0.0",
  "description": "WebSocket service for compiling and uploading Arduino projects",
  "endpoints": {
    "health": "/health",
    "websocket": "ws://localhost:3000"
  },
  "actions": ["compile", "upload", "verify", "list-boards", "install-cores"]
}
```

#### GET /health

Health check endpoint for monitoring service status.

```json
{
  "status": "ok",
  "timestamp": "2025-11-13T10:30:00.000Z",
  "arduinoCli": {
    "available": true,
    "path": "/usr/local/bin/arduino-cli"
  },
  "webSocket": {
    "connectionCount": 2
  },
  "service": {
    "port": 3000,
    "uptime": 3600.5
  }
}
```

### Connection Management

**Heartbeat System:** The server pings each connection every 30 seconds. Clients must respond with pong frames. Connections that fail to respond are terminated and cleaned up.

**Lifecycle:**

1. Client connects → Server assigns UUID and sends welcome message
2. Client sends action requests → Server processes and streams responses
3. Server pings periodically → Client responds with pong
4. Either side closes connection → Cleanup and logging

### Error Handling

**Common Validation Errors:**

- Missing required fields (sketchPath, board, port)
- Invalid action types
- Malformed JSON
- Invalid FQBN format

**Runtime Errors:**

- Arduino CLI not available
- Sketch compilation errors
- Upload failures (board not found, port access denied)
- Board detection failures

All errors are sent as error-type messages with descriptive error text and any available output from Arduino CLI.

### Usage Instructions for Developers

**1. Establish Connection:**

```javascript
const ws = new WebSocket("ws://localhost:3000");

ws.onopen = () => {
  console.log("Connected to TinyService");
};
```

**2. Send Action Request:**

```javascript
ws.send(
  JSON.stringify({
    action: "compile",
    payload: {
      sketchPath: "/absolute/path/to/sketch.ino",
      board: "tinyCore:esp32:tinyS3",
    },
  }),
);
```

**3. Handle Responses:**

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "status":
      console.log("Status:", message.data.message);
      break;
    case "output":
      console.log("Output:", message.data.output);
      break;
    case "error":
      console.error("Error:", message.data.error);
      break;
    case "complete":
      console.log("Complete:", message.data.message);
      break;
  }
};
```

**4. Handle Disconnection:**

```javascript
ws.onclose = () => {
  console.log("Disconnected from TinyService");
};
```

### Board FQBN Reference

Common Fully Qualified Board Names:

- **TinyS3:** `tinyCore:esp32:tinyS3`
- **TinyPICO:** `tinyCore:esp32:tinyPICO`
- **Arduino Uno:** `arduino:avr:uno`
- **Arduino Nano:** `arduino:avr:nano`
- **ESP32 Dev Module:** `esp32:esp32:esp32`

Use the `list-boards` action to discover FQBNs for connected boards, or run `arduino-cli board list` from the command line.

### Sequence Diagrams

#### Compile Operation

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService
participant CompileHandler
participant ArduinoCLI

    Client->>WebSocketService: Connect
    WebSocketService-->>Client: Welcome Message (connection ID)

    Client->>WebSocketService: {"action": "compile", "payload": {...}}
    WebSocketService->>CompileHandler: Route message
    CompileHandler->>ArduinoCLI: spawn compile command
    CompileHandler-->>Client: {"type": "status", "data": "Starting..."}

    loop Real-time output
        ArduinoCLI-->>CompileHandler: stdout/stderr
        CompileHandler-->>Client: {"type": "output", "data": {...}}
    end

    ArduinoCLI-->>CompileHandler: Process exit (code 0)
    CompileHandler-->>Client: {"type": "complete", "data": {...}}

:::

#### Upload Operation

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService
participant UploadHandler
participant ArduinoCLI
participant Board

    Client->>WebSocketService: {"action": "upload", "payload": {...}}
    WebSocketService->>UploadHandler: Route message
    UploadHandler->>ArduinoCLI: spawn upload command
    UploadHandler-->>Client: {"type": "status", "data": "Starting upload..."}

    loop Upload progress
        ArduinoCLI->>Board: Write firmware
        ArduinoCLI-->>UploadHandler: Progress output
        UploadHandler-->>Client: {"type": "output", "data": "Writing..."}
    end

    ArduinoCLI-->>UploadHandler: Upload complete
    UploadHandler-->>Client: {"type": "complete", "data": {...}}

:::

#### List Boards Operation

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService
participant BoardsHandler
participant ArduinoCLI

    Client->>WebSocketService: {"action": "list-boards", "payload": {}}
    WebSocketService->>BoardsHandler: Route message
    BoardsHandler-->>Client: {"type": "status", "data": "Scanning..."}
    BoardsHandler->>ArduinoCLI: board list --format json
    ArduinoCLI-->>BoardsHandler: JSON board data
    BoardsHandler->>BoardsHandler: Parse and prioritize tinyCore boards
    BoardsHandler-->>Client: {"type": "complete", "data": {"boards": [...]}}

:::

#### Install Cores Operation

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService
participant InstallCoresHandler
participant ArduinoCLI

    Client->>WebSocketService: {"action": "install-cores", "payload": {}}
    WebSocketService->>InstallCoresHandler: Route message
    InstallCoresHandler-->>Client: {"type": "status", "data": "Checking..."}

    InstallCoresHandler->>ArduinoCLI: config add board_manager.additional_urls
    InstallCoresHandler->>ArduinoCLI: core update-index
    InstallCoresHandler-->>Client: {"type": "output", "data": "Updating index..."}

    InstallCoresHandler->>ArduinoCLI: Check if esp32:esp32 installed

    alt ESP32 not installed
        InstallCoresHandler->>ArduinoCLI: core install esp32:esp32
        loop Installation progress
            ArduinoCLI-->>InstallCoresHandler: Download progress
            InstallCoresHandler-->>Client: {"type": "output", "data": {...}}
        end
    end

    InstallCoresHandler->>ArduinoCLI: Check if tinyCore:esp32 installed

    alt TinyCore not installed
        InstallCoresHandler->>ArduinoCLI: core install tinyCore:esp32
        loop Installation progress
            ArduinoCLI-->>InstallCoresHandler: Download progress
            InstallCoresHandler-->>Client: {"type": "output", "data": {...}}
        end
    end

    InstallCoresHandler-->>Client: {"type": "complete", "data": "Cores installed"}

:::

#### Connection Heartbeat

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService

    Client->>WebSocketService: Connect
    WebSocketService-->>Client: Welcome message

    loop Every 30 seconds
        WebSocketService->>Client: ping
        Client-->>WebSocketService: pong
    end

    Note over WebSocketService: If no pong received
    WebSocketService->>Client: terminate connection

:::

#### Error Handling Flow

:::mermaid
sequenceDiagram
participant Client
participant WebSocketService
participant Handler
participant ArduinoCLI

    Client->>WebSocketService: Invalid message (missing fields)
    WebSocketService->>WebSocketService: Validate message
    WebSocketService-->>Client: {"type": "error", "action": "invalid-message"}

    Client->>WebSocketService: Valid compile request
    WebSocketService->>Handler: Route message
    Handler->>ArduinoCLI: spawn compile
    ArduinoCLI-->>Handler: Process exit (code 1)
    Handler-->>Client: {"type": "error", "action": "compile", "data": {...}}

:::

### Design Patterns

**Handler Pattern:** Each action type (compile, upload, verify, list-boards) has a dedicated handler class that encapsulates the logic for that operation. This keeps the WebSocketService focused on connection management and message routing.

**Observer Pattern:** The ArduinoCliService streams real-time output through callback functions, allowing handlers to forward output to clients as it's generated rather than waiting for process completion.

**Validation Layer:** The MessageValidator class provides a centralized validation layer that ensures all incoming and outgoing messages conform to the protocol specification before processing or transmission.

**Connection Pooling:** The WebSocketService maintains a Map of active connections indexed by UUID, enabling efficient broadcast operations and connection cleanup.
