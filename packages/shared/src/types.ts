/**
 * Action types that can be requested by the client
 */
export type ActionType =
  | "compile"
  | "upload"
  | "list-boards"
  | "verify"
  | "install-cores";

/**
 * Message types for server responses
 */
export type MessageType = "status" | "output" | "error" | "complete";

/**
 * Incoming message from client to server
 */
export interface IncomingMessage {
  action: ActionType;
  payload: {
    sketchPath: string;
    board: string; // FQBN format
    port?: string;
  };
}

/**
 * Outgoing message from server to client
 */
export interface OutgoingMessage {
  type: MessageType;
  action: string;
  data: any;
}

/**
 * Compile request payload
 */
export interface CompileRequest {
  sketchPath: string;
  board: string;
}

/**
 * Upload request payload
 */
export interface UploadRequest {
  sketchPath: string;
  board: string;
  port: string;
}

/**
 * Board information
 */
export interface BoardInfo {
  fqbn: string;
  name: string;
  port?: string;
}

/**
 * Arduino CLI operation result
 */
export interface ArduinoCliResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Status message data
 */
export interface StatusData {
  message: string;
  connectionId?: string;
  progress?: number;
}

/**
 * Error message data
 */
export interface ErrorData {
  error: string;
  details?: string;
}

/**
 * Output message data
 */
export interface OutputData {
  output: string;
  stream?: "stdout" | "stderr";
}

/**
 * Complete message data
 */
export interface CompleteData {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

/**
 * Typed outgoing messages for different scenarios
 */
export type TypedOutgoingMessage =
  | {
      type: "status";
      action: string;
      data: StatusData;
    }
  | {
      type: "output";
      action: string;
      data: OutputData;
    }
  | {
      type: "error";
      action: string;
      data: ErrorData;
    }
  | {
      type: "complete";
      action: string;
      data: CompleteData;
    };
