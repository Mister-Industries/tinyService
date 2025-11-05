# Quick Start: Using @tinyservice/shared

## Installation

The package is already installed as a workspace dependency. To use it:

```bash
# Build the shared package first
npm run build:shared

# Then build other packages
npm run build
```

## Client Usage Example

Create a new React component in your client application:

```tsx
// src/components/ArduinoController.tsx
import { useTinyService } from "@tinyservice/shared";

export function ArduinoController() {
  const {
    connected,
    messages,
    compile,
    upload,
    verify,
    listBoards,
    clearMessages,
  } = useTinyService({
    url: "ws://localhost:8080",
    autoConnect: true,
    autoReconnect: true,
    debug: true,
  });

  const handleCompile = () => {
    compile("./sketch/blink.ino", "arduino:avr:uno");
  };

  const handleUpload = () => {
    upload("./sketch/blink.ino", "arduino:avr:uno", "/dev/ttyUSB0");
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <span
          className={`px-2 py-1 rounded ${
            connected ? "bg-green-500" : "bg-red-500"
          } text-white`}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="space-x-2 mb-4">
        <button
          onClick={handleCompile}
          disabled={!connected}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Compile
        </button>
        <button
          onClick={handleUpload}
          disabled={!connected}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Upload
        </button>
        <button
          onClick={() => verify("./sketch/blink.ino", "arduino:avr:uno")}
          disabled={!connected}
          className="px-4 py-2 bg-yellow-500 text-white rounded disabled:opacity-50"
        >
          Verify
        </button>
        <button
          onClick={listBoards}
          disabled={!connected}
          className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
        >
          List Boards
        </button>
        <button
          onClick={clearMessages}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          Clear
        </button>
      </div>

      <div className="border rounded p-4 max-h-96 overflow-y-auto">
        <h3 className="font-bold mb-2">Messages:</h3>
        {messages.map((msg, i) => (
          <div key={i} className="mb-2 p-2 bg-gray-100 rounded">
            <div className="font-semibold">
              {msg.type.toUpperCase()} - {msg.action}
            </div>
            <pre className="text-sm">{JSON.stringify(msg.data, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## service Usage (Already Integrated)

The service has been updated to use the shared package. Here's how it's being used:

```typescript
// In websocket.service.ts
import {
  IncomingMessage,
  OutgoingMessage,
  MessageValidator,
} from "@tinyservice/shared";

// Parsing incoming messages with validation
const result = MessageValidator.parseIncoming(data.toString());
if (result.error) {
  logger.error(`Invalid message: ${result.error}`);
  this.sendError(connection, "invalid-message", result.error);
  return;
}

if (result.message) {
  await this.handleMessage(connection, result.message);
}
```

## Standalone WebSocket Client (Vanilla JS/TS)

If you prefer not to use React, you can use the client directly:

```typescript
import { TinyServiceClient } from "@tinyservice/shared";

const client = new TinyServiceClient({
  url: "ws://localhost:8080",
  autoReconnect: true,
  debug: true,
});

// Event handlers
const unsubscribeMessage = client.onMessage((message) => {
  console.log("Received:", message);

  switch (message.type) {
    case "status":
      updateStatus(message.data.message);
      break;
    case "output":
      appendOutput(message.data.output);
      break;
    case "error":
      showError(message.data.error);
      break;
    case "complete":
      onComplete(message.data.success);
      break;
  }
});

const unsubscribeError = client.onError((error) => {
  console.error("WebSocket error:", error);
});

// Connect
client.connect();

// Send commands
document.getElementById("compile-btn").addEventListener("click", () => {
  client.compile("/path/to/sketch", "arduino:avr:uno");
});

// Cleanup when done
window.addEventListener("beforeunload", () => {
  unsubscribeMessage();
  unsubscribeError();
  client.disconnect();
});
```

## Message Types Reference

### Incoming (Client → service)

```typescript
// Compile
{ action: "compile", payload: { sketchPath: "...", board: "..." } }

// Upload
{ action: "upload", payload: { sketchPath: "...", board: "...", port: "..." } }

// Verify
{ action: "verify", payload: { sketchPath: "...", board: "..." } }

// List Boards
{ action: "list-boards", payload: { sketchPath: "", board: "" } }
```

### Outgoing (service → Client)

```typescript
// Status
{ type: "status", action: "compile", data: { message: "Starting..." } }

// Output
{ type: "output", action: "compile", data: { output: "...", stream: "stdout" } }

// Error
{ type: "error", action: "compile", data: { error: "Failed", details: "..." } }

// Complete
{ type: "complete", action: "compile", data: { success: true, message: "..." } }
```

## Development Workflow

```bash
# 1. Make changes to shared package
cd packages/shared/src

# 2. Rebuild shared package
npm run build:shared

# 3. Changes are automatically available to client and service
# (because they're using the workspace link)

# 4. Build everything
npm run build
```

## Benefits You Get

✅ **Type Safety**: All messages are typed
✅ **Validation**: Invalid messages are caught automatically  
✅ **Auto-Reconnect**: Client reconnects on disconnect
✅ **Event-Driven**: Simple event handlers for messages
✅ **React Ready**: Use the hook for easy React integration
✅ **No Duplication**: Single source of truth for message protocol

## Next Steps

1. Copy the `ArduinoController` component example to your client
2. Import and use it in your main `App.tsx`
3. Start the dev environment: `npm run dev`
4. Test the WebSocket communication!
