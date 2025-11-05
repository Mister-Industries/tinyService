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
