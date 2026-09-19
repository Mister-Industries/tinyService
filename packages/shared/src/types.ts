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
  | "serial-write"
  | "board-details";

/**
 * Server-initiated push actions (no client request, no request id).
 */
export type PushActionType = "board-events";

/**
 * Message types for server responses
 */
export type MessageType = "status" | "output" | "error" | "complete";

/**
 * Incoming message from client to server
 */
export interface IncomingMessage {
  action: ActionType;
  /**
   * Optional request id. When present, the server echoes it on every message
   * sent in response to this request (status/output/error/complete), so
   * clients can correlate concurrent requests of the same action instead of
   * matching on the action name alone.
   */
  id?: string;
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
    /**
     * Serial monitor (serial-write): when true, `data` is written to the port
     * exactly as provided — the service appends nothing. When false/omitted the
     * service appends "\n" (legacy behavior). Clients that offer line-ending
     * choices (None / NL / CR / CRLF) should apply the ending themselves and
     * send raw: true.
     */
    raw?: boolean;
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
  /**
   * Echo of the originating request's id (when the request carried one).
   * Server-initiated pushes (e.g. "board-events", streamed "serial" output)
   * have no id.
   */
  id?: string;
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
  /**
   * True when the board identity was guessed from USB VID/PID rather than
   * matched by arduino-cli. UIs should let the user override such entries
   * (e.g. via a "choose board for this port" picker).
   */
  guess?: boolean;
  /** Port protocol as reported by arduino-cli (e.g. "serial") */
  protocol?: string;
}

/**
 * One selectable value of an FQBN config option (board-details)
 */
export interface BoardConfigOptionValue {
  value: string;
  valueLabel: string;
  selected?: boolean;
}

/**
 * One FQBN config option of a board (board-details), e.g. PSRAM, CPU
 * frequency, partition scheme. Selected values are appended to the FQBN as
 * `base:option=value,option2=value2`.
 */
export interface BoardConfigOption {
  option: string;
  optionLabel: string;
  values: BoardConfigOptionValue[];
}

/**
 * Result of board-details: the board's identity plus its Tools-menu
 * equivalents (config options and programmers).
 */
export interface BoardDetails {
  fqbn: string;
  name: string;
  configOptions: BoardConfigOption[];
  programmers: { id: string; name: string }[];
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
