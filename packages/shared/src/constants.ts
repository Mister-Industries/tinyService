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
  // Boards Manager: platform (core) management + additional board-manager URLs
  CORE_SEARCH: "core-search" as const,
  CORE_LIST: "core-list" as const,
  CORE_INSTALL: "core-install" as const,
  CORE_UNINSTALL: "core-uninstall" as const,
  BOARD_LISTALL: "board-listall" as const,
  BOARD_URL_LIST: "board-url-list" as const,
  BOARD_URL_ADD: "board-url-add" as const,
  BOARD_URL_REMOVE: "board-url-remove" as const,
  SERIAL_OPEN: "serial-open" as const,
  SERIAL_CLOSE: "serial-close" as const,
  SERIAL_WRITE: "serial-write" as const,
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
