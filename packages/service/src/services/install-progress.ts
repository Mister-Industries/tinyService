/**
 * Turns arduino-cli's human-readable install output into structured progress.
 *
 * When stdout isn't a terminal, arduino-cli (text format) still draws its
 * download bars, one carriage-return-separated frame at a time:
 *
 *   \resp32:esp-rv32@2601 30.00 MiB / 590.04 MiB    5.08% 00m41s
 *   \resp32:esp-rv32@2601 downloaded\n
 *   Installing esp32:esp-rv32@2601...\n
 *   esp32:esp-rv32@2601 installed\n
 *   Installing platform esp32:esp32@3.3.12...\n
 *   Configuring platform....\n
 *   Platform esp32:esp32@3.3.12 installed\n
 *
 * Library installs read "Downloading X@1.0...", "Installing X@1.0...",
 * "Installed X@1.0". The parser keeps the latest state and hands back the
 * finished lines (progress frames excluded) for the log.
 */

export interface InstallProgressState {
  current?: {
    item: string;
    phase: "downloading" | "installing" | "configuring";
    percent?: number;
    total?: string;
  };
  done: string[];
  lastLine?: string;
}

const SIZE = String.raw`\d+(?:\.\d+)?\s?[KMGT]?i?B`;
const DOWNLOAD_FRAME = new RegExp(
  String.raw`^(\S+)\s+(${SIZE})\s*/\s*(${SIZE})\s+(\d+(?:\.\d+)?)%`
);
const DOWNLOADED = /^(\S+)\s+(?:already\s+)?downloaded$/i;
const INSTALLING = /^Installing\s+(?:platform\s+)?(\S+?)\.{3}$/i;
const INSTALLED = /^(?:Platform\s+)?(\S+)\s+installed$/i;
const LIB_INSTALLED = /^(?:Installed|Already installed)\s+(\S+)$/i;
const LIB_DOWNLOADING = /^Downloading\s+(\S+?)\.{3}$/i;
const CONFIGURING = /^Configuring\s+(?:platform|tool)/i;
const UNINSTALLING = /^Uninstalling\s+(\S+?)(?:,\s.*)?\.{3}$/i;

/** Lines that are noise for a progress log. */
const NOISE = [
  /^Downloading packages\.{3}$/i,
  /^Skipping (?:tool|platform) configuration\.{3,}$/i,
];

export class InstallProgressParser {
  private carry = "";
  private readonly state: InstallProgressState = { done: [] };

  /** Feed raw output; returns the complete, non-progress lines it contained. */
  feed(chunk: string): string[] {
    this.carry += chunk;
    const pieces = this.carry.split(/[\r\n]/);
    this.carry = pieces.pop() ?? "";
    const lines: string[] = [];
    for (const piece of pieces) {
      const frame = piece.trim();
      if (!frame) continue;
      if (this.apply(frame)) lines.push(frame);
    }
    // A partial frame still tells us the current download percentage.
    const partial = this.carry.trim();
    if (partial) {
      const m = DOWNLOAD_FRAME.exec(partial);
      if (m) this.setDownloading(m);
    }
    return lines;
  }

  /** Flush whatever is buffered (call when the process exits). */
  end(): string[] {
    const rest = this.carry;
    this.carry = "";
    return rest ? this.feed(rest + "\n") : [];
  }

  snapshot(): InstallProgressState {
    return {
      ...(this.state.current ? { current: { ...this.state.current } } : {}),
      done: [...this.state.done],
      ...(this.state.lastLine ? { lastLine: this.state.lastLine } : {}),
    };
  }

  /** Update state from one frame; true when the frame belongs in the log. */
  private apply(frame: string): boolean {
    let m = DOWNLOAD_FRAME.exec(frame);
    if (m) {
      this.setDownloading(m);
      return false; // progress frames are not log lines
    }
    if (NOISE.some((re) => re.test(frame))) return false;

    this.state.lastLine = frame;
    if ((m = DOWNLOADED.exec(frame))) {
      this.markDone(m[1]);
    } else if ((m = INSTALLING.exec(frame)) || (m = UNINSTALLING.exec(frame))) {
      this.state.current = { item: m[1], phase: "installing" };
    } else if ((m = LIB_DOWNLOADING.exec(frame))) {
      this.state.current = { item: m[1], phase: "downloading" };
    } else if (CONFIGURING.test(frame)) {
      this.state.current = {
        item: this.state.current?.item ?? "",
        phase: "configuring",
      };
    } else if ((m = INSTALLED.exec(frame)) || (m = LIB_INSTALLED.exec(frame))) {
      this.markDone(m[1]);
      if (this.state.current?.item === m[1]) this.state.current = undefined;
    }
    return true;
  }

  private setDownloading(m: RegExpExecArray): void {
    this.state.current = {
      item: m[1],
      phase: "downloading",
      percent: Math.min(100, Math.max(0, parseFloat(m[4]))),
      total: m[3].replace(/\s+/, " "),
    };
  }

  private markDone(item: string): void {
    if (!this.state.done.includes(item)) this.state.done.push(item);
  }
}
