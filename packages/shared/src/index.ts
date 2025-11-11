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

// React hooks (optional, requires React as peer dependency)
// Note: Import directly from '@mister-industries/shared/hooks/useTinyService.js' if needed
// export { useTinyService } from "./hooks/useTinyService.js";
// export type {
//   UseTinyServiceOptions,
//   UseTinyServiceReturn,
// } from "./hooks/useTinyService.js";
