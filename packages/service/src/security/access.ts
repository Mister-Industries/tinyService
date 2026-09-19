import type { IncomingHttpHeaders } from "http";

/**
 * Who may talk to tinyService.
 *
 * The service compiles code and flashes boards on the user's computer, so a web
 * page the user happens to visit must not be able to drive it. Browsers send an
 * `Origin` header on every WebSocket handshake and every cross-origin request,
 * so checking it keeps other sites out. A client that sends no `Origin` isn't a
 * browser (a Node script, wscat, an embedder's health check) and already runs
 * on this computer, so it is let through.
 *
 * `Origin` alone leaves DNS rebinding open: a site can point its own domain at
 * 127.0.0.1, and its requests then look same-origin. So while the service is
 * bound to a loopback address, the `Host` header must name this computer too.
 */

/**
 * The hosted tinyStudio web app (studio.tinycore.cc, and app.tinystudio.cc while
 * it still serves the app), and pages served from this computer on any port
 * (the tinyStudio dev servers, the test client).
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://studio.tinycore.cc",
  "https://app.tinystudio.cc",
  "http://localhost:*",
  "http://127.0.0.1:*",
];

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Whether `origin` matches an entry of `allowed`. An entry is an exact origin
 * (`https://app.tinystudio.cc`, `file://`), an origin with port `*`
 * (`http://localhost:*` matches any port, or none), or `*` for every origin.
 * A missing origin always matches.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowed: readonly string[]
): boolean {
  if (!origin) return true;
  const o = normalizeOrigin(origin);
  return allowed.some((entry) => {
    const e = normalizeOrigin(entry);
    if (e === "*") return true;
    if (!e.endsWith(":*")) return o === e;
    const base = e.slice(0, -2);
    if (o === base) return true;
    return o.startsWith(`${base}:`) && /^\d+$/.test(o.slice(base.length + 1));
  });
}

/** Whether an address or hostname refers to this computer only. */
export function isLoopbackAddress(address: string): boolean {
  const a = address.trim().toLowerCase();
  return (
    a === "localhost" ||
    a === "::1" ||
    a === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a)
  );
}

/** `localhost:3000` → `localhost`, `[::1]:3000` → `::1`. */
function hostnameOf(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h : h.slice(1, end);
  }
  const colon = h.indexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

/**
 * Whether a request's `Host` header is acceptable. While the service is bound
 * to a loopback address it must name this computer: `localhost`, a
 * `*.localhost` name, a 127.x address or `[::1]`. A service deliberately bound
 * to a network address accepts any Host. A missing Host means a non-browser
 * client.
 */
export function isHostAllowed(
  host: string | undefined,
  bindAddress: string
): boolean {
  if (!host || !isLoopbackAddress(bindAddress)) return true;
  const name = hostnameOf(host);
  return isLoopbackAddress(name) || name.endsWith(".localhost");
}

/**
 * Why a request must be refused, or null when it may proceed. Checked for HTTP
 * requests and for every WebSocket upgrade, `/lsp` included.
 */
export function refusalReason(
  headers: Pick<IncomingHttpHeaders, "origin" | "host">,
  options: { allowedOrigins: readonly string[]; host: string }
): string | null {
  if (!isHostAllowed(headers.host, options.host)) {
    return `host "${headers.host}" is not this computer`;
  }
  if (!isOriginAllowed(headers.origin, options.allowedOrigins)) {
    return `origin "${headers.origin}" is not in allowedOrigins`;
  }
  return null;
}
