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
  | "core-search"
  | "core-list"
  | "core-install"
  | "core-uninstall"
  | "board-listall"
  | "board-url-list"
  | "board-url-add"
  | "board-url-remove"
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
    /**
     * Web build only: the sketch's files as { relativePath: textContent },
     * relative to the sketch folder (e.g. { "fade.ino": "...", "pitches.h": "..." }).
     * A browser can't hand the service a real disk path (the File System Access
     * API hides absolute paths), so it ships the files instead; the service
     * materializes them to a temp dir and compiles/uploads that. Desktop omits
     * this and sends a real `sketchPath` on disk.
     */
    files?: Record<string, string>;
    /** Web build: folder name to give the materialized sketch (defaults to the .ino's base name). */
    sketchName?: string;
    /**
     * Library manager: search term (lib-search) or library name (install/uninstall).
     * Boards manager: search term (core-search) or platform id (core-install/uninstall).
     */
    library?: string;
    /** Library/Boards manager: optional version for lib-install / core-install */
    version?: string;
    /** Boards manager: additional board-manager URL (board-url-add/remove) */
    url?: string;
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
 * Platform (core) metadata returned by core-search / core-list
 */
export interface PlatformInfo {
  /** Platform id, e.g. "esp32:esp32" */
  id: string;
  /** Human-readable name, e.g. "esp32 Boards" */
  name: string;
  /** Installed version (core-list) or empty if not installed */
  installed: string;
  /** Latest available version */
  latest: string;
  /** Maintainer / author */
  maintainer?: string;
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
  files?: Record<string, string>;
  sketchName?: string;
}

/**
 * Upload request payload
 */
export interface UploadRequest {
  sketchPath: string;
  board: string;
  port: string;
  files?: Record<string, string>;
  sketchName?: string;
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
