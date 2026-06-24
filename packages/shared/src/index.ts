// Type definitions
export * from "./types.js";

// Constants
export * from "./constants.js";

// Message factory and validators
export { MessageFactory } from "./factory.js";
export { MessageValidator } from "./validator.js";
export type { ValidationResult } from "./validator.js";

// WebSocket client (for browser/client use)
export { TinyServiceClient } from "./client.js";
export type {
  ConnectionHandler,
  ErrorHandler,
  MessageHandler,
  WebSocketClientConfig,
} from "./client.js";

// React hook (optional). Intentionally NOT re-exported from the index: a static
// re-export forces every consumer — including the Node service and any non-React
// environment — to resolve `react` at import time, which throws
// ERR_MODULE_NOT_FOUND where react isn't installed. React consumers import it
// directly:
//   import { useTinyService } from "@mister-industries/shared/dist/hooks/useTinyService.js";
// (types are erased at runtime, so re-exporting them here is safe).
export type {
  UseTinyServiceOptions,
  UseTinyServiceReturn,
} from "./hooks/useTinyService.js";
