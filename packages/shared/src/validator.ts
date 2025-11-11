import { ACTIONS, MESSAGE_TYPES } from "./constants.js";
import type {
  ActionType,
  IncomingMessage,
  MessageType,
  OutgoingMessage,
} from "./types.js";

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validators for message types
 */
export class MessageValidator {
  /**
   * Validate an incoming message from client
   */
  static validateIncoming(data: any): ValidationResult {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "Message must be an object" };
    }

    const validActions: ActionType[] = [
      ACTIONS.COMPILE,
      ACTIONS.UPLOAD,
      ACTIONS.VERIFY,
      ACTIONS.LIST_BOARDS,
      ACTIONS.INSTALL_CORES,
    ];

    if (!validActions.includes(data.action)) {
      return { valid: false, error: `Invalid action: ${data.action}` };
    }

    if (!data.payload || typeof data.payload !== "object") {
      return { valid: false, error: "Message must have a payload object" };
    }

    const { payload } = data;

    // Validate based on action type
    switch (data.action) {
      case ACTIONS.COMPILE:
      case ACTIONS.VERIFY:
        if (!payload.sketchPath || typeof payload.sketchPath !== "string") {
          return {
            valid: false,
            error: "sketchPath is required and must be a string",
          };
        }
        if (!payload.board || typeof payload.board !== "string") {
          return {
            valid: false,
            error: "board is required and must be a string",
          };
        }
        break;

      case ACTIONS.UPLOAD:
        if (!payload.sketchPath || typeof payload.sketchPath !== "string") {
          return {
            valid: false,
            error: "sketchPath is required and must be a string",
          };
        }
        if (!payload.board || typeof payload.board !== "string") {
          return {
            valid: false,
            error: "board is required and must be a string",
          };
        }
        if (!payload.port || typeof payload.port !== "string") {
          return {
            valid: false,
            error: "port is required and must be a string for upload",
          };
        }
        break;

      case ACTIONS.LIST_BOARDS:
        // No specific validation needed for list-boards
        break;

      case ACTIONS.INSTALL_CORES:
        // No specific validation needed for install-cores
        break;
    }

    return { valid: true };
  }

  /**
   * Validate an outgoing message from server
   */
  static validateOutgoing(data: any): ValidationResult {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "Message must be an object" };
    }

    const validTypes: MessageType[] = [
      MESSAGE_TYPES.STATUS,
      MESSAGE_TYPES.OUTPUT,
      MESSAGE_TYPES.ERROR,
      MESSAGE_TYPES.COMPLETE,
    ];

    if (!validTypes.includes(data.type)) {
      return { valid: false, error: `Invalid message type: ${data.type}` };
    }

    if (!data.action || typeof data.action !== "string") {
      return { valid: false, error: "action is required and must be a string" };
    }

    if (data.data === undefined) {
      return { valid: false, error: "data field is required" };
    }

    return { valid: true };
  }

  /**
   * Check if a string is a valid JSON message
   */
  static isValidJSON(str: string): ValidationResult {
    try {
      JSON.parse(str);
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid JSON format" };
    }
  }

  /**
   * Parse and validate an incoming message from string
   */
  static parseIncoming(str: string): {
    message?: IncomingMessage;
    error?: string;
  } {
    const jsonValidation = this.isValidJSON(str);
    if (!jsonValidation.valid) {
      return { error: jsonValidation.error };
    }

    try {
      const data = JSON.parse(str);
      const validation = this.validateIncoming(data);

      if (!validation.valid) {
        return { error: validation.error };
      }

      return { message: data as IncomingMessage };
    } catch {
      return { error: "Failed to parse message" };
    }
  }

  /**
   * Parse and validate an outgoing message from string
   */
  static parseOutgoing(str: string): {
    message?: OutgoingMessage;
    error?: string;
  } {
    const jsonValidation = this.isValidJSON(str);
    if (!jsonValidation.valid) {
      return { error: jsonValidation.error };
    }

    try {
      const data = JSON.parse(str);
      const validation = this.validateOutgoing(data);

      if (!validation.valid) {
        return { error: validation.error };
      }

      return { message: data as OutgoingMessage };
    } catch {
      return { error: "Failed to parse message" };
    }
  }
}
