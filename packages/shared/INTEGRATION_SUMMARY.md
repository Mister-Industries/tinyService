# Shared Messaging Package

## Overview

Successfully created `@tinyservice/shared` - a shared npm package that abstracts the messaging layer between the client and service packages.

## Package Structure

```
packages/shared/
├── src/
│   ├── index.ts           # Main entry point
│   ├── types.ts           # Type definitions
│   ├── constants.ts       # Constant values
│   ├── factory.ts         # Message factory
│   ├── validator.ts       # Message validators
│   ├── client.ts          # WebSocket client wrapper
│   └── hooks/
│       └── useTinyService.ts  # React hook
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

## Features

### 1. Type Definitions (`types.ts`)

- `IncomingMessage` - Client to service messages
- `OutgoingMessage` - service to client messages
- `CompileRequest`, `UploadRequest` - Request payloads
- `BoardInfo`, `ArduinoCliResult` - Data structures
- Typed message data interfaces (`StatusData`, `ErrorData`, `OutputData`, `CompleteData`)

### 2. Constants (`constants.ts`)

- `ACTIONS` - Available action types
- `MESSAGE_TYPES` - Message type constants
- `CONNECTION_EVENTS` - Connection event types

### 3. Message Factory (`factory.ts`)

Provides static methods for creating type-safe messages:

- `MessageFactory.compile()` - Create compile request
- `MessageFactory.upload()` - Create upload request
- `MessageFactory.verify()` - Create verify request
- `MessageFactory.listBoards()` - Create list boards request
- `MessageFactory.status()` - Create status response
- `MessageFactory.output()` - Create output response
- `MessageFactory.error()` - Create error response
- `MessageFactory.complete()` - Create complete response

### 4. Message Validator (`validator.ts`)

Provides validation for messages:

- `MessageValidator.validateIncoming()` - Validate client messages
- `MessageValidator.validateOutgoing()` - Validate service messages
- `MessageValidator.parseIncoming()` - Parse and validate JSON string
- `MessageValidator.parseOutgoing()` - Parse and validate JSON string
- `MessageValidator.isValidJSON()` - Check JSON validity

### 5. WebSocket Client (`client.ts`)

Browser-ready WebSocket client with:

- Type-safe API methods (`compile()`, `upload()`, `verify()`, `listBoards()`)
- Event handlers (`onMessage`, `onError`, `onConnect`, `onDisconnect`)
- Automatic reconnection with configurable attempts
- Connection state management
- Message validation

### 6. React Hook (`hooks/useTinyService.ts`)

React hook for easy integration:

- Manages client lifecycle
- Provides connection state
- Collects messages
- Error handling
- Auto-connect and auto-reconnect
- Cleanup on unmount

## Integration

### service Package

The service package has been updated to:

1. Add `@tinyservice/shared` as a dependency
2. Import types from the shared package
3. Use `MessageValidator` for parsing incoming messages
4. Export service-specific types alongside shared types

### Client Package

The client package has been updated to:

1. Add `@tinyservice/shared` as a dependency
2. Ready to use `TinyServiceClient` or `useTinyService` hook

### Workspace Configuration

Root `package.json` updated to:

- Include shared package in workspace
- Add build script for shared package
- Ensure shared is built before other packages

## Usage Examples

### Client (React Component)

```tsx
import { useTinyService } from "@tinyservice/shared";

function ArduinoCompiler() {
  const { connected, messages, compile } = useTinyService({
    url: "ws://localhost:8080",
    autoConnect: true,
  });

  return (
    <div>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <button onClick={() => compile("/path/to/sketch", "arduino:avr:uno")}>
        Compile
      </button>
    </div>
  );
}
```

### service (Message Handling)

```typescript
import { MessageValidator, MessageFactory } from "@tinyservice/shared";

// Parse incoming message
const result = MessageValidator.parseIncoming(data.toString());
if (result.message) {
  // Handle message
}

// Send response
ws.send(
  JSON.stringify(MessageFactory.status("compile", { message: "Starting..." }))
);
```

## Benefits

1. **Type Safety**: Shared TypeScript types ensure consistency
2. **Validation**: Built-in message validation prevents errors
3. **DRY**: No code duplication between client and service
4. **Maintainability**: Single source of truth for message protocol
5. **Extensibility**: Easy to add new message types or actions
6. **Developer Experience**: Auto-completion and type checking in IDEs

## Next Steps

To start using the shared package:

```bash
# Install dependencies
npm install

# Build the shared package
npm run build:shared

# Or build everything
npm run build
```

The service already uses the shared package. To use it in the client, simply import:

```typescript
import { TinyServiceClient, useTinyService } from "@tinyservice/shared";
```

## Documentation

Full documentation is available in `packages/shared/README.md` with:

- Installation instructions
- API reference
- Usage examples for both client and service
- Type definitions
- React examples

