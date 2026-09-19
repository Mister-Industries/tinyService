# API Reference

Complete API documentation for the Arduino WebSocket Service.

## WebSocket Connection

**Endpoint**: `ws://localhost:3000`

The WebSocket Service accepts connections from localhost and maintains persistent connections for real-time communication.

## Message Format

### Request (Client → Server)

```typescript
interface IncomingMessage {
  action: "compile" | "upload" | "list-boards" | "verify";
  payload: {
    sketchPath: string;
    board: string; // FQBN format
    port?: string; // Required for upload
  };
}
```

### Response (Server → Client)

```typescript
interface OutgoingMessage {
  type: "status" | "output" | "error" | "complete";
  action: string;
  data: any;
}
```

## Actions

### 1. Compile

Compiles an Arduino sketch without uploading.

**Request**:

```json
{
  "action": "compile",
  "payload": {
    "sketchPath": "/path/to/sketch",
    "board": "arduino:avr:uno"
  }
}
```

**Response Sequence**:

1. Status update:

```json
{
  "type": "status",
  "action": "compile",
  "data": {
    "message": "Starting compilation...",
    "sketchPath": "/path/to/sketch",
    "board": "arduino:avr:uno"
  }
}
```

2. Real-time output (multiple messages):

```json
{
  "type": "output",
  "action": "compile",
  "data": {
    "output": "Compiling sketch..."
  }
}
```

3. Completion or error:

```json
{
  "type": "complete",
  "action": "compile",
  "data": {
    "message": "Compilation completed successfully",
    "sketchPath": "/path/to/sketch",
    "board": "arduino:avr:uno",
    "output": "Full compilation output..."
  }
}
```

### 2. Upload

Compiles and uploads a sketch to a connected board.

**Request**:

```json
{
  "action": "upload",
  "payload": {
    "sketchPath": "/path/to/sketch",
    "board": "arduino:avr:uno",
    "port": "/dev/ttyUSB0"
  }
}
```

**Response**: Similar to compile, with upload-specific messages.

### 3. Verify

Verifies a sketch (compile with verification flag).

**Request**:

```json
{
  "action": "verify",
  "payload": {
    "sketchPath": "/path/to/sketch",
    "board": "arduino:avr:uno"
  }
}
```

**Response**: Similar to compile.

### 4. List Boards

Lists all connected Arduino boards.

**Request**:

```json
{
  "action": "list-boards",
  "payload": {}
}
```

**Response**:

```json
{
  "type": "complete",
  "action": "list-boards",
  "data": {
    "message": "Found 2 connected board(s)",
    "boards": [
      {
        "fqbn": "arduino:avr:uno",
        "name": "Arduino Uno",
        "port": "/dev/ttyUSB0"
      },
      {
        "fqbn": "arduino:avr:nano",
        "name": "Arduino Nano",
        "port": "/dev/ttyUSB1"
      }
    ]
  }
}
```

## HTTP Endpoints

### GET /

Returns service information.

**Response**:

```json
{
  "name": "Arduino WebSocket Service",
  "version": "1.0.0",
  "description": "WebSocket service for compiling and uploading Arduino projects",
  "endpoints": {
    "health": "/health",
    "websocket": "ws://localhost:3000"
  },
  "actions": ["compile", "upload", "verify", "list-boards"]
}
```

### GET /health

Health check endpoint for monitoring.

**Response**:

```json
{
  "status": "ok",
  "timestamp": "2025-10-27T22:00:00.000Z",
  "arduinoCli": {
    "available": true,
    "path": "arduino-cli"
  },
  "webSocket": {
    "connectionCount": 2
  },
  "server": {
    "port": 3000,
    "uptime": 3600
  }
}
```

## Error Handling

### Error Response Format

```json
{
  "type": "error",
  "action": "compile",
  "data": {
    "error": "Error message here",
    "output": "Additional error details..."
  }
}
```

### Common Errors

| Error                         | Description                         | Solution                        |
| ----------------------------- | ----------------------------------- | ------------------------------- |
| `Missing required parameters` | Request missing sketchPath or board | Include all required fields     |
| `Arduino CLI not available`   | arduino-cli not found               | Install Arduino CLI             |
| `Compilation failed`          | Sketch has syntax errors            | Check sketch code               |
| `Upload failed`               | Cannot upload to board              | Check board connection and port |
| `Invalid message format`      | Malformed JSON                      | Validate JSON before sending    |

## Board FQBN Reference

Common board Fully Qualified Board Names:

| Board             | FQBN                        |
| ----------------- | --------------------------- |
| Arduino Uno       | `arduino:avr:uno`           |
| Arduino Nano      | `arduino:avr:nano`          |
| Arduino Mega 2560 | `arduino:avr:mega`          |
| Arduino Leonardo  | `arduino:avr:leonardo`      |
| Arduino Micro     | `arduino:avr:micro`         |
| ESP32 Dev Module  | `esp32:esp32:esp32`         |
| ESP8266 NodeMCU   | `esp8266:esp8266:nodemcuv2` |

To find FQBN for other boards:

```bash
arduino-cli board list
```

## Connection Lifecycle

1. **Connect**: Client establishes WebSocket connection
2. **Welcome**: Server sends connection confirmation
3. **Active**: Client sends requests, server streams responses
4. **Heartbeat**: Server pings every 30 seconds to keep connection alive
5. **Disconnect**: Clean connection closure or timeout

## Rate Limiting

Currently no rate limiting is implemented. For production use, consider adding:

- Request rate limits per connection
- Concurrent operation limits
- Queue management for multiple compile/upload requests

## Security Considerations

tinyService compiles code and flashes boards on the user's computer, so it
talks only to this computer and to tinyStudio:

- It listens on `127.0.0.1`. Set `host` (or `TINYSERVICE_HOST`) to listen
  elsewhere, for example `0.0.0.0` to reach it from another machine.
- A WebSocket connection (`/lsp` included) or HTTP request that carries an
  `Origin` header is refused with `403` unless that origin is in
  `allowedOrigins`. The default list is `https://studio.tinycore.cc`,
  `https://app.tinystudio.cc`, `http://localhost:*` and `http://127.0.0.1:*`. An entry is an exact origin
  (`file://` for a packaged Electron app), an origin with port `*`, or `*` for
  any origin.
- A request with no `Origin` header is accepted. Browsers always send one, so
  such a client is a program already running on this computer.
- While listening on a loopback address, a request whose `Host` header doesn't
  name this computer is refused. This blocks DNS rebinding.
- CORS responses name the allowed origin rather than `*`.

Not implemented:

- Authentication: any program on this computer can connect
- HTTPS/WSS connections
- File path restrictions

