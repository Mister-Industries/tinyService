# TinyService Messaging Protocol

This document describes the WebSocket messaging protocol used by TinyService for communicating between clients and the Arduino CLI service.

## Overview

TinyService uses a WebSocket-based messaging system for real-time communication with clients. The service listens for incoming action requests and responds with status updates, output streams, completion messages, and errors.

**WebSocket Endpoint:** `ws://localhost:<port>`  
**Default Port:** Configured in `.env` file (typically `3000`)

## Connection Flow

### 1. Initial Connection

When a client connects to the WebSocket server:

1. Server assigns a unique connection ID (UUID v4)
2. Connection is added to the active connections map
3. Server sends a welcome message to the client

**Welcome Message (Server → Client):**

```json
{
  "type": "status",
  "action": "connect",
  "data": {
    "message": "Connected to Arduino WebSocket Service",
    "connectionId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 2. Heartbeat Mechanism

- Server sends `ping` frames every 30 seconds
- Client must respond with `pong` frames
- Connections that don't respond are terminated
- This ensures inactive connections are cleaned up

## Message Structure

### Incoming Messages (Client → Server)

All incoming messages must follow this structure:

```typescript
{
  "action": ActionType,
  "payload": {
    "sketchPath": string,    // Required for compile/upload/verify
    "board": string,          // Required for compile/upload/verify (FQBN format)
    "port"?: string          // Required only for upload
  }
}
```

**Valid Actions:**

- `"compile"` - Compile an Arduino sketch
- `"upload"` - Upload a compiled sketch to a board
- `"verify"` - Verify (compile without uploading) a sketch
- `"list-boards"` - List all connected Arduino boards
- `"install-cores"` - Install required board cores (tinyCore)

### Outgoing Messages (Server → Client)

All outgoing messages follow this structure:

```typescript
{
  "type": MessageType,
  "action": string,        // Echo of the original action
  "data": any             // Type-specific data
}
```

**Message Types:**

- `"status"` - Status updates during operation
- `"output"` - Real-time output from Arduino CLI
- `"error"` - Error messages
- `"complete"` - Operation completed successfully

## Actions

### 1. Compile Action

Compiles an Arduino sketch for a specific board.

#### Request (Client → Server)

```json
{
  "action": "compile",
  "payload": {
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3"
  }
}
```

**Required Fields:**

- `sketchPath` (string): Absolute path to the Arduino sketch file (.ino)
- `board` (string): Fully Qualified Board Name (FQBN) in format `vendor:architecture:board`

#### Response Messages

**1. Status Message:**

```json
{
  "type": "status",
  "action": "compile",
  "data": {
    "message": "Starting compilation...",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3"
  }
}
```

**2. Output Messages (streaming):**

```json
{
  "type": "output",
  "action": "compile",
  "data": {
    "output": "Sketch uses 12345 bytes (1%) of program storage space..."
  }
}
```

**3. Complete Message (success):**

```json
{
  "type": "complete",
  "action": "compile",
  "data": {
    "success": true,
    "message": "Compilation completed successfully",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "output": "Full compilation output..."
  }
}
```

**4. Error Message (failure):**

```json
{
  "type": "error",
  "action": "compile",
  "data": {
    "error": "Compilation failed",
    "output": "Error details from Arduino CLI..."
  }
}
```

#### Arduino CLI Command

Internally executes:

```bash
arduino-cli compile --verbose --fqbn <board> <sketchPath>
```

---

### 2. Upload Action

Uploads a compiled sketch to an Arduino board via a serial port.

#### Request (Client → Server)

```json
{
  "action": "upload",
  "payload": {
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "port": "/dev/ttyUSB0"
  }
}
```

**Required Fields:**

- `sketchPath` (string): Absolute path to the Arduino sketch file
- `board` (string): Fully Qualified Board Name (FQBN)
- `port` (string): Serial port identifier (e.g., `/dev/ttyUSB0`, `COM3`)

#### Response Messages

**1. Status Message:**

```json
{
  "type": "status",
  "action": "upload",
  "data": {
    "message": "Starting upload...",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "port": "/dev/ttyUSB0"
  }
}
```

**2. Output Messages (streaming):**

```json
{
  "type": "output",
  "action": "upload",
  "data": {
    "output": "Writing at 0x00010000... (10%)"
  }
}
```

**3. Complete Message (success):**

```json
{
  "type": "complete",
  "action": "upload",
  "data": {
    "success": true,
    "message": "Upload completed successfully",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "port": "/dev/ttyUSB0",
    "output": "Full upload output..."
  }
}
```

**4. Error Message (failure):**

```json
{
  "type": "error",
  "action": "upload",
  "data": {
    "error": "Upload failed",
    "output": "Error details from Arduino CLI..."
  }
}
```

#### Arduino CLI Command

Internally executes:

```bash
arduino-cli upload --fqbn <board> --port <port> <sketchPath>
```

---

### 3. Verify Action

Verifies (compiles without uploading) an Arduino sketch. Similar to compile but uses the `--verify` flag.

#### Request (Client → Server)

```json
{
  "action": "verify",
  "payload": {
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3"
  }
}
```

**Required Fields:**

- `sketchPath` (string): Absolute path to the Arduino sketch file
- `board` (string): Fully Qualified Board Name (FQBN)

#### Response Messages

Same structure as compile action, but with `"action": "verify"`:

**1. Status Message:**

```json
{
  "type": "status",
  "action": "verify",
  "data": {
    "message": "Starting verification...",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3"
  }
}
```

**2. Output Messages (streaming):**

```json
{
  "type": "output",
  "action": "verify",
  "data": {
    "output": "Verifying sketch..."
  }
}
```

**3. Complete Message (success):**

```json
{
  "type": "complete",
  "action": "verify",
  "data": {
    "success": true,
    "message": "Verification completed successfully",
    "sketchPath": "/path/to/sketch/sketch.ino",
    "board": "tinyCore:esp32:tinyS3",
    "output": "Full verification output..."
  }
}
```

**4. Error Message (failure):**

```json
{
  "type": "error",
  "action": "verify",
  "data": {
    "error": "Verification failed",
    "output": "Error details..."
  }
}
```

#### Arduino CLI Command

Internally executes:

```bash
arduino-cli compile --verify --fqbn <board> <sketchPath>
```

---

### 4. List Boards Action

Lists all Arduino boards currently connected to the system.

#### Request (Client → Server)

```json
{
  "action": "list-boards",
  "payload": {}
}
```

**Required Fields:** None (payload can be empty object)

#### Response Messages

**1. Status Message:**

```json
{
  "type": "status",
  "action": "list-boards",
  "data": {
    "message": "Scanning for connected boards..."
  }
}
```

**2. Complete Message (success):**

```json
{
  "type": "complete",
  "action": "list-boards",
  "data": {
    "message": "Found 2 connected board(s)",
    "boards": [
      {
        "fqbn": "tinyCore:esp32:tinyS3",
        "name": "TinyS3",
        "port": "/dev/ttyUSB0"
      },
      {
        "fqbn": "tinyCore:esp32:tinyPICO",
        "name": "TinyPICO",
        "port": "/dev/ttyUSB1"
      }
    ]
  }
}
```

**3. Error Message (failure):**

```json
{
  "type": "error",
  "action": "list-boards",
  "data": {
    "error": "Error listing boards: <error message>"
  }
}
```

#### Board Priority

When multiple matching boards are detected for a single port, the service prioritizes:

1. **tinyCore boards** (FQBN starting with `tinyCore:`) - Preferred
2. **Other matching boards** - Fallback

#### Arduino CLI Command

Internally executes:

```bash
arduino-cli board list --format json
```

---

### 5. Install Cores Action

Installs required board cores for tinyCore boards. This is typically a one-time setup operation.

#### Request (Client → Server)

```json
{
  "action": "install-cores",
  "payload": {}
}
```

**Required Fields:** None (payload can be empty object)

#### Response Messages

**1. Status Message:**

```json
{
  "type": "status",
  "action": "install-cores",
  "data": {
    "message": "Checking board core installation..."
  }
}
```

**2. Output Messages (streaming):**

```json
{
  "type": "output",
  "action": "install-cores",
  "data": {
    "output": "Installing ESP32 package by Espressif...\n"
  }
}
```

```json
{
  "type": "output",
  "action": "install-cores",
  "data": {
    "output": "Installing tinyCore ESP32 Boards by mr.industries...\n"
  }
}
```

**3. Complete Message (success):**

```json
{
  "type": "complete",
  "action": "install-cores",
  "data": {
    "success": true,
    "message": "Board cores installed and ready"
  }
}
```

**4. Error Message (failure):**

```json
{
  "type": "error",
  "action": "install-cores",
  "data": {
    "error": "Failed to install board cores",
    "details": "Detailed error message..."
  }
}
```

#### Installation Process

The service performs the following steps:

1. **Add Board Manager URL:**
   - URL: `https://raw.githubusercontent.com/Mister-Industries/arduino-board-index/refs/heads/main/package_tiny_core_index.json`
   - Command: `arduino-cli config add board_manager.additional_urls <url>`

2. **Update Core Index:**
   - Command: `arduino-cli core update-index`

3. **Install ESP32 Package (Dependency):**
   - Package: `esp32:esp32`
   - Command: `arduino-cli core install esp32:esp32`
   - Skipped if already installed

4. **Install tinyCore Package:**
   - Package: `tinyCore:esp32`
   - Command: `arduino-cli core install tinyCore:esp32`
   - Skipped if already installed

---

## Error Handling

### Invalid Message Format

If the client sends an invalid message, the server responds with:

```json
{
  "type": "error",
  "action": "invalid-message",
  "data": {
    "error": "Detailed validation error message"
  }
}
```

### Common Validation Errors

1. **Missing Required Fields:**

```json
{
  "type": "error",
  "action": "compile",
  "data": {
    "error": "Missing required parameters: sketchPath and board"
  }
}
```

2. **Invalid Action:**

```json
{
  "type": "error",
  "action": "unknown-action",
  "data": {
    "error": "Unknown action: unknown-action"
  }
}
```

3. **Internal Server Error:**

```json
{
  "type": "error",
  "action": "compile",
  "data": {
    "error": "Internal server error"
  }
}
```

---

## Message Validation

### Incoming Message Validation

The service validates incoming messages using the following rules:

1. **Must be valid JSON**
2. **Must have an `action` field** with one of the valid action types
3. **Must have a `payload` object**
4. **Payload must contain required fields** based on action type:
   - `compile`/`verify`: `sketchPath` and `board` required
   - `upload`: `sketchPath`, `board`, and `port` required
   - `list-boards`: no required fields
   - `install-cores`: no required fields

### Outgoing Message Validation

All outgoing messages are validated to ensure:

1. **Valid message type** (`status`, `output`, `error`, `complete`)
2. **Action field is present** and is a string
3. **Data field is present** (can be any type based on message type)

---

## Best Practices

### For Client Implementations

1. **Handle All Message Types:**
   - Listen for `status`, `output`, `error`, and `complete` messages
   - Update UI accordingly for each message type

2. **Stream Output in Real-Time:**
   - Display `output` messages as they arrive for better user feedback
   - Especially important for long-running operations (compile, upload, install-cores)

3. **Implement Connection Recovery:**
   - Handle WebSocket disconnections gracefully
   - Attempt reconnection with exponential backoff

4. **Respond to Ping Frames:**
   - Ensure your WebSocket client responds to ping frames
   - This prevents connection from being terminated

5. **Validate Before Sending:**
   - Ensure all required fields are present before sending messages
   - Use absolute paths for `sketchPath`
   - Verify FQBN format for `board` parameter

### Message Flow Examples

#### Successful Compile Flow

```
Client → Server: { action: "compile", payload: {...} }
Server → Client: { type: "status", ... } (Starting compilation)
Server → Client: { type: "output", ... } (Build output line 1)
Server → Client: { type: "output", ... } (Build output line 2)
Server → Client: { type: "output", ... } (Build output line 3)
...
Server → Client: { type: "complete", ... } (Success)
```

#### Failed Upload Flow

```
Client → Server: { action: "upload", payload: {...} }
Server → Client: { type: "status", ... } (Starting upload)
Server → Client: { type: "output", ... } (Upload attempt)
Server → Client: { type: "error", ... } (Upload failed)
```

#### List Boards Flow

```
Client → Server: { action: "list-boards", payload: {} }
Server → Client: { type: "status", ... } (Scanning)
Server → Client: { type: "complete", ... } (Board list)
```

---

## TypeScript Types

For TypeScript clients, you can use the shared types from `@mister-industries/shared`:

```typescript
import type {
  ActionType,
  MessageType,
  IncomingMessage,
  OutgoingMessage,
  BoardInfo,
  CompileRequest,
  UploadRequest,
  StatusData,
  OutputData,
  ErrorData,
  CompleteData,
} from "@mister-industries/shared";
```

---

## Health Check Endpoint

While not part of the WebSocket protocol, TinyService provides an HTTP health check endpoint:

**Endpoint:** `GET http://localhost:<port>/health`

**Response:**

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

---

## Connection Lifecycle

1. **Connect:** Client establishes WebSocket connection
2. **Welcome:** Server sends connection status with unique ID
3. **Active:** Client sends action requests, server responds with messages
4. **Heartbeat:** Server pings every 30 seconds, client responds with pong
5. **Disconnect:** Either side closes connection gracefully
6. **Cleanup:** Server removes connection from active connections map

---

## Logging

The service logs all important events:

- New connections and disconnections
- Message receipt and handling
- Action execution (compile, upload, etc.)
- Errors and validation failures
- Arduino CLI command execution

Logs help with debugging and monitoring service health.
