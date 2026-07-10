import WebSocket from "ws";

// Re-export shared types
export {
  IncomingMessage,
  OutgoingMessage,
  CompileRequest,
  UploadRequest,
  BoardInfo,
  ArduinoCliResult,
  ActionType,
  MessageType,
  StatusData,
  ErrorData,
  OutputData,
  CompleteData,
} from "@mister-industries/shared";

// Service-specific types
export interface WebSocketConnection extends WebSocket {
  id: string;
  isAlive: boolean;
}

export interface ServiceConfig {
  port: number;
  arduinoCliPath: string;
  allowedOrigins: string[];
  /**
   * Absolute path to the `arduino-language-server` binary. When set (and the
   * binary exists) the service exposes an LSP-over-WebSocket bridge at /lsp.
   */
  lspServerPath?: string;
  /** Absolute path to the `clangd` binary required by arduino-language-server. */
  clangdPath?: string;
  /** Absolute path to arduino-cli.yaml, passed to the language server. */
  cliConfigPath?: string;
}
