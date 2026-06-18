/**
 * Supported action types
 */
export const ACTIONS = {
  COMPILE: "compile" as const,
  UPLOAD: "upload" as const,
  VERIFY: "verify" as const,
  LIST_BOARDS: "list-boards" as const,
  INSTALL_CORES: "install-cores" as const,
  LIB_SEARCH: "lib-search" as const,
  LIB_LIST: "lib-list" as const,
  LIB_INSTALL: "lib-install" as const,
  LIB_UNINSTALL: "lib-uninstall" as const,
};

/**
 * Message types
 */
export const MESSAGE_TYPES = {
  STATUS: "status" as const,
  OUTPUT: "output" as const,
  ERROR: "error" as const,
  COMPLETE: "complete" as const,
};

/**
 * Connection event types
 */
export const CONNECTION_EVENTS = {
  CONNECT: "connect" as const,
  DISCONNECT: "disconnect" as const,
  ERROR: "error" as const,
  MESSAGE: "message" as const,
};
