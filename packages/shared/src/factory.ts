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
   * Create a compile request message
   */
  static compile(sketchPath: string, board: string): IncomingMessage {
    return {
      action: ACTIONS.COMPILE,
      payload: {
        sketchPath,
        board,
      },
    };
  }

  /**
   * Create a verify request message
   */
  static verify(sketchPath: string, board: string): IncomingMessage {
    return {
      action: ACTIONS.VERIFY,
      payload: {
        sketchPath,
        board,
      },
    };
  }

  /**
   * Create an upload request message
   */
  static upload(
    sketchPath: string,
    board: string,
    port: string
  ): IncomingMessage {
    return {
      action: ACTIONS.UPLOAD,
      payload: {
        sketchPath,
        board,
        port,
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
   * Send a line to the serial port
   */
  static serialWrite(data: string): IncomingMessage {
    return {
      action: ACTIONS.SERIAL_WRITE,
      payload: { sketchPath: "", board: "", data },
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
