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
  /**
   * Address to listen on. Defaults to 127.0.0.1, so only this computer can
   * connect; `0.0.0.0` opens the service to the network.
   */
  host: string;
  arduinoCliPath: string;
  /**
   * Browser origins allowed to connect: exact origins (`file://`,
   * `https://app.tinystudio.cc`), origins with port `*` (`http://localhost:*`),
   * or `*` for any. Clients that send no Origin header are always accepted.
   */
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
