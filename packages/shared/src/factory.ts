import { ACTIONS, MESSAGE_TYPES } from "./constants.js";
import type {
  CompleteData,
  ErrorData,
  IncomingMessage,
  OutgoingMessage,
  OutputData,
  StatusData,
} from "./types.js";

/**
 * Factory for creating incoming messages (client -> server)
 */
export class MessageFactory {
  /**
   * Create a compile request message. Pass `files` (web build) to ship the
   * sketch's contents instead of relying on a real `sketchPath` on disk.
   */
  static compile(
    sketchPath: string,
    board: string,
    files?: Record<string, string>,
    sketchName?: string
  ): IncomingMessage {
    return {
      action: ACTIONS.COMPILE,
      payload: {
        sketchPath,
        board,
        ...(files ? { files, sketchName } : {}),
      },
    };
  }

  /**
   * Create a verify request message. Pass `files` (web build) to ship the
   * sketch's contents instead of relying on a real `sketchPath` on disk.
   */
  static verify(
    sketchPath: string,
    board: string,
    files?: Record<string, string>,
    sketchName?: string
  ): IncomingMessage {
    return {
      action: ACTIONS.VERIFY,
      payload: {
        sketchPath,
        board,
        ...(files ? { files, sketchName } : {}),
      },
    };
  }

  /**
   * Create an upload request message. Pass `files` (web build) to ship the
   * sketch's contents instead of relying on a real `sketchPath` on disk.
   */
  static upload(
    sketchPath: string,
    board: string,
    port: string,
    files?: Record<string, string>,
    sketchName?: string
  ): IncomingMessage {
    return {
      action: ACTIONS.UPLOAD,
      payload: {
        sketchPath,
        board,
        port,
        ...(files ? { files, sketchName } : {}),
      },
    };
  }

  /**
   * Create a list boards request message
   */
  static listBoards(): IncomingMessage {
    return {
      action: ACTIONS.LIST_BOARDS,
      payload: {
        sketchPath: "",
        board: "",
      },
    };
  }

  /**
   * Create an install cores request message
   */
  static installCores(): IncomingMessage {
    return {
      action: ACTIONS.INSTALL_CORES,
      payload: {
        sketchPath: "",
        board: "",
      },
    };
  }

  /**
   * Create a library search request message
   */
  static libSearch(query: string): IncomingMessage {
    return {
      action: ACTIONS.LIB_SEARCH,
      payload: { sketchPath: "", board: "", library: query },
    };
  }

  /**
   * Create a list-installed-libraries request message
   */
  static libList(): IncomingMessage {
    return {
      action: ACTIONS.LIB_LIST,
      payload: { sketchPath: "", board: "" },
    };
  }

  /**
   * Create a library install request message
   */
  static libInstall(library: string, version?: string): IncomingMessage {
    return {
      action: ACTIONS.LIB_INSTALL,
      payload: { sketchPath: "", board: "", library, version },
    };
  }

  /**
   * Create a library uninstall request message
   */
  static libUninstall(library: string): IncomingMessage {
    return {
      action: ACTIONS.LIB_UNINSTALL,
      payload: { sketchPath: "", board: "", library },
    };
  }

  /**
   * Create a platform (core) search request message
   */
  static coreSearch(query: string): IncomingMessage {
    return {
      action: ACTIONS.CORE_SEARCH,
      payload: { sketchPath: "", board: "", library: query },
    };
  }

  /**
   * Create a list-installed-platforms request message
   */
  static coreList(): IncomingMessage {
    return {
      action: ACTIONS.CORE_LIST,
      payload: { sketchPath: "", board: "" },
    };
  }

  /**
   * Create a platform (core) install request message
   */
  static coreInstall(platform: string, version?: string): IncomingMessage {
    return {
      action: ACTIONS.CORE_INSTALL,
      payload: { sketchPath: "", board: "", library: platform, version },
    };
  }

  /**
   * Create a platform (core) uninstall request message
   */
  static coreUninstall(platform: string): IncomingMessage {
    return {
      action: ACTIONS.CORE_UNINSTALL,
      payload: { sketchPath: "", board: "", library: platform },
    };
  }

  /**
   * Create a request for every board (FQBN) from installed platforms
   */
  static boardListall(): IncomingMessage {
    return {
      action: ACTIONS.BOARD_LISTALL,
      payload: { sketchPath: "", board: "" },
    };
  }

  /**
   * Create a request to list the configured additional board-manager URLs
   */
  static boardUrlList(): IncomingMessage {
    return {
      action: ACTIONS.BOARD_URL_LIST,
      payload: { sketchPath: "", board: "" },
    };
  }

  /**
   * Create a request to add an additional board-manager URL
   */
  static boardUrlAdd(url: string): IncomingMessage {
    return {
      action: ACTIONS.BOARD_URL_ADD,
      payload: { sketchPath: "", board: "", url },
    };
  }

  /**
   * Create a request to remove an additional board-manager URL
   */
  static boardUrlRemove(url: string): IncomingMessage {
    return {
      action: ACTIONS.BOARD_URL_REMOVE,
      payload: { sketchPath: "", board: "", url },
    };
  }

  /**
   * Open the serial monitor on a port at a baud rate
   */
  static serialOpen(port: string, baud: number): IncomingMessage {
    return {
      action: ACTIONS.SERIAL_OPEN,
      payload: { sketchPath: "", board: "", port, baud },
    };
  }

  /**
   * Close the serial monitor
   */
  static serialClose(): IncomingMessage {
    return {
      action: ACTIONS.SERIAL_CLOSE,
      payload: { sketchPath: "", board: "" },
    };
  }

  /**
   * Send data to the serial port. With `raw: true` the service writes `data`
   * exactly as provided (client applies its own line ending); otherwise the
   * service appends "\n" (legacy behavior).
   */
  static serialWrite(data: string, raw?: boolean): IncomingMessage {
    return {
      action: ACTIONS.SERIAL_WRITE,
      payload: { sketchPath: "", board: "", data, ...(raw ? { raw } : {}) },
    };
  }

  /**
   * Request FQBN config options + programmers for a board
   * (arduino-cli board details)
   */
  static boardDetails(fqbn: string): IncomingMessage {
    return {
      action: ACTIONS.BOARD_DETAILS,
      payload: { sketchPath: "", board: fqbn },
    };
  }

  /**
   * Create a status response message
   */
  static status(action: string, data: StatusData): OutgoingMessage {
    return {
      type: MESSAGE_TYPES.STATUS,
      action,
      data,
    };
  }

  /**
   * Create an output response message
   */
  static output(action: string, data: OutputData): OutgoingMessage {
    return {
      type: MESSAGE_TYPES.OUTPUT,
      action,
      data,
    };
  }

  /**
   * Create an error response message
   */
  static error(action: string, data: ErrorData): OutgoingMessage {
    return {
      type: MESSAGE_TYPES.ERROR,
      action,
      data,
    };
  }

  /**
   * Create a complete response message
   */
  static complete(action: string, data: CompleteData): OutgoingMessage {
    return {
      type: MESSAGE_TYPES.COMPLETE,
      action,
      data,
    };
  }
}
