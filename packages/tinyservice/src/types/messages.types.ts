import WebSocket from "ws";

// Re-export shared types
export {
  ActionType,
  ArduinoCliResult,
  BoardInfo,
  CompileRequest,
  CompleteData,
  ErrorData,
  IncomingMessage,
  MessageType,
  OutgoingMessage,
  OutputData,
  StatusData,
  UploadRequest,
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
