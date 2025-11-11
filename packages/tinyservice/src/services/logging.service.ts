// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  orange: "\x1b[38;5;208m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

export class LoggingService {
  private static instance: LoggingService;

  private constructor() {}

  public static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  private formatMessage(level: string, color: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${color}[${level}] ${timestamp} - ${message}${colors.reset}`;
  }

  public info(message: string, ...args: any[]): void {
    console.log(this.formatMessage("INFO", colors.blue, message), ...args);
  }

  public error(message: string, ...args: any[]): void {
    console.error(this.formatMessage("ERROR", colors.red, message), ...args);
  }

  public warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage("WARN", colors.orange, message), ...args);
  }

  public debug(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage("DEBUG", colors.gray, message), ...args);
    }
  }
}

// Export singleton instance
export const logger = LoggingService.getInstance();
