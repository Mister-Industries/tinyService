/**
 * Action types that can be requested by the client
 */
export type ActionType =
  | "compile"
  | "upload"
  | "list-boards"
  | "verify"
  | "install-cores"
  | "lib-search"
  | "lib-list"
  | "lib-install"
  | "lib-uninstall"
  | "serial-open"
  | "serial-close"
  | "serial-write";

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
    /** Library manager: search term (lib-search) or library name (install/uninstall) */
    library?: string;
    /** Library manager: optional version for lib-install */
    version?: string;
    /** Serial monitor: baud rate (serial-open) */
    baud?: number;
    /** Serial monitor: line to send (serial-write) */
    data?: string;
  };
}

/**
 * Library metadata returned by lib-search / lib-list
 */
export interface LibraryInfo {
  name: string;
  author: string;
  sentence: string;
  version: string;
  installed?: boolean;
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
