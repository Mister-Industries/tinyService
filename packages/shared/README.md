# @tinyservice/shared

Shared messaging layer for TinyService client-service communication. This package provides type-safe message definitions, validation, and utilities for both the WebSocket service and browser clients.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- ✅ **Validation**: Built-in message validation for both incoming and outgoing messages
- 🏭 **Message Factory**: Easy message creation with factory methods
- 🌐 **WebSocket Client**: Ready-to-use browser WebSocket client with auto-reconnection
- 🔄 **Shared Types**: Consistent message types across client and service
- 📦 **Zero Dependencies**: Core package has no runtime dependencies (client uses browser WebSocket API)

## Installation

```bash
# In your workspace
npm install @tinyservice/shared
```

## Usage

### For Browser/Client Applications

#### Basic WebSocket Client

```typescript
import { TinyServiceClient } from "@tinyservice/shared";

// Create client instance
const client = new TinyServiceClient({
  url: "ws://localhost:8080",
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectInterval: 3000,
  debug: true,
});

// Set up event handlers
client.onConnect(() => {
  console.log("Connected to service!");
});

client.onMessage((message) => {
  console.log("Received:", message);

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
      console.log("Complete:", message.data.success);
      break;
  }
});

client.onError((error) => {
  console.error("Error:", error);
});

client.onDisconnect(() => {
  console.log("Disconnected from service");
});

// Connect to service
client.connect();

// Send requests
client.compile("/path/to/sketch", "arduino:avr:uno");
client.upload("/path/to/sketch", "arduino:avr:uno", "/dev/ttyUSB0");
client.verify("/path/to/sketch", "arduino:avr:uno");
client.listBoards();

// Disconnect when done
client.disconnect();
```

#### React Example

```tsx
import { useEffect, useState } from "react";
import { TinyServiceClient, OutgoingMessage } from "@tinyservice/shared";

function ArduinoCompiler() {
  const [client, setClient] = useState<TinyServiceClient | null>(null);
  const [messages, setMessages] = useState<OutgoingMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const wsClient = new TinyServiceClient({
      url: "ws://localhost:8080",
      autoReconnect: true,
      debug: true,
    });

    wsClient.onConnect(() => setConnected(true));
    wsClient.onDisconnect(() => setConnected(false));
    wsClient.onMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    wsClient.connect();
    setClient(wsClient);

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const handleCompile = () => {
    if (client && connected) {
      client.compile("/path/to/sketch", "arduino:avr:uno");
    }
  };

  return (
    <div>
      <h1>Arduino Compiler</h1>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <button onClick={handleCompile} disabled={!connected}>
        Compile Sketch
      </button>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.type}:</strong> {JSON.stringify(msg.data)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### For service Applications (Node.js)

#### Using Message Factory

```typescript
import { MessageFactory } from "@tinyservice/shared";
import WebSocket from "ws";

// Create messages
const statusMessage = MessageFactory.status("compile", {
  message: "Starting compilation...",
  progress: 10,
});

const outputMessage = MessageFactory.output("compile", {
  output: "Compiling sketch...",
  stream: "stdout",
});

const errorMessage = MessageFactory.error("compile", {
  error: "Compilation failed",
  details: "Missing library",
});

const completeMessage = MessageFactory.complete("compile", {
  success: true,
  message: "Compilation successful",
  output: "Binary size: 1024 bytes",
});

// Send to client
ws.send(JSON.stringify(statusMessage));
```

#### Using Message Validator

```typescript
import { MessageValidator } from "@tinyservice/shared";

// Validate incoming message
const result = MessageValidator.parseIncoming(messageString);
if (result.error) {
  console.error("Invalid message:", result.error);
  return;
}

// Use validated message
const message = result.message;
console.log("Action:", message.action);
console.log("Payload:", message.payload);

// Validate outgoing message before sending
const outgoingResult = MessageValidator.validateOutgoing(myMessage);
if (!outgoingResult.valid) {
  console.error("Invalid outgoing message:", outgoingResult.error);
  return;
}
```

#### Integration with WebSocket service

```typescript
import WebSocket from "ws";
import {
  MessageValidator,
  MessageFactory,
  IncomingMessage,
} from "@tinyservice/shared";

const wss = new WebSocket.service({ port: 8080 });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const result = MessageValidator.parseIncoming(data.toString());

    if (result.error) {
      // Send error response
      const errorMsg = MessageFactory.error("invalid", {
        error: result.error,
      });
      ws.send(JSON.stringify(errorMsg));
      return;
    }

    if (result.message) {
      handleMessage(ws, result.message);
    }
  });
});

function handleMessage(ws: WebSocket, message: IncomingMessage) {
  switch (message.action) {
    case "compile":
      // Send status
      ws.send(
        JSON.stringify(
          MessageFactory.status("compile", { message: "Starting..." })
        )
      );
      // ... perform compilation
      break;
    // Handle other actions
  }
}
```

## API Reference

### Types

#### `IncomingMessage`

Message sent from client to service.

```typescript
interface IncomingMessage {
  action: "compile" | "upload" | "list-boards" | "verify";
  payload: {
    sketchPath: string;
    board: string;
    port?: string;
  };
}
```

#### `OutgoingMessage`

Message sent from service to client.

```typescript
interface OutgoingMessage {
  type: "status" | "output" | "error" | "complete";
  action: string;
  data: any;
}
```

#### `BoardInfo`

Information about an Arduino board.

```typescript
interface BoardInfo {
  fqbn: string;
  name: string;
  port?: string;
}
```

### Classes

#### `TinyServiceClient`

WebSocket client for browser applications.

**Constructor:**

```typescript
new TinyServiceClient(config: WebSocketClientConfig)
```

**Methods:**

- `connect()`: Connect to service
- `disconnect()`: Disconnect from service
- `isConnected()`: Check connection status
- `compile(sketchPath, board)`: Compile sketch
- `verify(sketchPath, board)`: Verify sketch without upload
- `upload(sketchPath, board, port)`: Upload sketch to board
- `listBoards()`: Request list of available boards
- `onMessage(handler)`: Register message handler
- `onError(handler)`: Register error handler
- `onConnect(handler)`: Register connect handler
- `onDisconnect(handler)`: Register disconnect handler

#### `MessageFactory`

Factory for creating type-safe messages.

**Static Methods:**

- `compile(sketchPath, board)`: Create compile request
- `verify(sketchPath, board)`: Create verify request
- `upload(sketchPath, board, port)`: Create upload request
- `listBoards()`: Create list boards request
- `status(action, data)`: Create status response
- `output(action, data)`: Create output response
- `error(action, data)`: Create error response
- `complete(action, data)`: Create complete response

#### `MessageValidator`

Validator for message validation.

**Static Methods:**

- `validateIncoming(data)`: Validate incoming message
- `validateOutgoing(data)`: Validate outgoing message
- `parseIncoming(str)`: Parse and validate incoming message string
- `parseOutgoing(str)`: Parse and validate outgoing message string
- `isValidJSON(str)`: Check if string is valid JSON

## Constants

```typescript
export const ACTIONS = {
  COMPILE: "compile",
  UPLOAD: "upload",
  VERIFY: "verify",
  LIST_BOARDS: "list-boards",
};

export const MESSAGE_TYPES = {
  STATUS: "status",
  OUTPUT: "output",
  ERROR: "error",
  COMPLETE: "complete",
};
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode
npm run watch

# Clean build artifacts
npm run clean
```

## License

MIT

