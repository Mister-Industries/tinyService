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
}
