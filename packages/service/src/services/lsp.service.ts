import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import type { IncomingMessage as HttpIncomingMessage } from "http";
import type { Duplex } from "stream";
import WebSocket, { WebSocketServer } from "ws";
import { config, logger } from "../config.js";

/**
 * LSP-over-WebSocket proxy for the Arduino Language Server.
 *
 * Each WebSocket connection to `/lsp?fqbn=<fqbn>` spawns one
 * `arduino-language-server` process (which itself drives clangd) and bridges
 * it to the client:
 *
 *   WS text message (one JSON-RPC payload)  →  stdin with LSP Content-Length framing
 *   stdout LSP-framed JSON-RPC payloads     →  WS text messages (one per payload)
 *
 * The browser/renderer side can therefore speak plain JSON-RPC over the
 * socket without worrying about stdio framing — which is what makes the same
 * client work for both the desktop and web builds.
 *
 * If the language server (or clangd) binary isn't configured/present the
 * socket is closed with reason "lsp-unavailable" and clients degrade to the
 * regex-highlighting-only editor.
 */
export class LspService {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly children = new Set<ChildProcess>();

  constructor() {
    this.wss.on("connection", (ws, request) => {
      this.onConnection(ws, request as HttpIncomingMessage);
    });
  }

  /** True when the required binaries are configured and exist on disk. */
  isAvailable(): boolean {
    const ls = config.lspServerPath;
    const clangd = config.clangdPath;
    return Boolean(ls && existsSync(ls) && clangd && existsSync(clangd));
  }

  handleUpgrade(
    request: HttpIncomingMessage,
    socket: Duplex,
    head: Buffer
  ): void {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  close(): void {
    for (const child of this.children) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
    this.children.clear();
    this.wss.close();
  }

  private onConnection(ws: WebSocket, request: HttpIncomingMessage): void {
    if (!this.isAvailable()) {
      logger.warn(
        "LSP connection refused: arduino-language-server/clangd not configured or missing"
      );
      ws.close(1011, "lsp-unavailable");
      return;
    }

    const url = new URL(request.url || "/lsp", "http://localhost");
    const fqbn = url.searchParams.get("fqbn") || "arduino:avr:uno";

    const args = [
      "-clangd",
      config.clangdPath!,
      "-cli",
      config.arduinoCliPath,
      "-fqbn",
      fqbn,
    ];
    if (config.cliConfigPath && existsSync(config.cliConfigPath)) {
      args.push("-cli-config", config.cliConfigPath);
    }

    logger.info(`Starting arduino-language-server (fqbn=${fqbn})`);
    let child: ChildProcess;
    try {
      child = spawn(config.lspServerPath!, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      logger.error("Failed to start arduino-language-server:", error);
      ws.close(1011, "lsp-spawn-failed");
      return;
    }
    this.children.add(child);

    // ── WS → child stdin (add LSP framing) ─────────────────────────────────
    ws.on("message", (data) => {
      if (!child.stdin?.writable) return;
      const payload = typeof data === "string" ? data : data.toString();
      const length = Buffer.byteLength(payload, "utf8");
      child.stdin.write(`Content-Length: ${length}\r\n\r\n${payload}`);
    });

    // ── child stdout → WS (strip LSP framing) ──────────────────────────────
    let buffer = Buffer.alloc(0);
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Parse as many complete Content-Length-framed payloads as available.
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buffer.subarray(0, headerEnd).toString("utf8");
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          // Malformed header — drop it and resync.
          buffer = buffer.subarray(headerEnd + 4);
          continue;
        }
        const contentLength = parseInt(match[1], 10);
        const messageStart = headerEnd + 4;
        if (buffer.length < messageStart + contentLength) break; // incomplete
        const payload = buffer
          .subarray(messageStart, messageStart + contentLength)
          .toString("utf8");
        buffer = buffer.subarray(messageStart + contentLength);
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    });

    child.stderr?.on("data", (d: Buffer) => {
      const text = d.toString().trim();
      if (text) logger.debug("arduino-language-server:", text);
    });

    const teardown = (): void => {
      this.children.delete(child);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };

    child.on("close", (code) => {
      this.children.delete(child);
      logger.info(`arduino-language-server exited (code ${code})`);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, "lsp-exited");
    });
    child.on("error", (error) => {
      logger.error("arduino-language-server process error:", error);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, "lsp-error");
      teardown();
    });

    ws.on("close", teardown);
    ws.on("error", teardown);
  }
}
