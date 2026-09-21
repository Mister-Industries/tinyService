# Changelog

## tinyservice 1.2.1 and tinyService Agent 1.1.1 — not released

### Fixed

- A sketch whose name contains `-` or `.` compiles again. The temp folder the
  web build's files are written to was sanitized more strictly than the .ino
  inside it, so `blink-alternate.ino` landed in a folder called
  `blink_alternate` and arduino-cli reported "main file missing from sketch".
  The folder now keeps the characters the Arduino IDE allows, and the main
  .ino is renamed with the folder whenever sanitizing does change the name.

## tinyservice 1.2.0 and tinyService Agent 1.1.0 — released 2026-09-18

### Security

- tinyService listens on `127.0.0.1` only, so other computers on the network
  can't reach it. It used to listen on every interface.
- Websites can no longer drive tinyService. WebSocket connections (`/lsp`
  included) and HTTP requests from a browser origin outside `allowedOrigins` are
  refused with `403`. The default allows the tinyStudio web app
  (`https://studio.tinycore.cc` and `https://app.tinystudio.cc`) and pages
  served from `localhost` or `127.0.0.1` on any port. Clients that send no
  `Origin` header, such as Node scripts and health checks, still connect.
- Requests whose `Host` header isn't this computer are refused, which blocks
  DNS rebinding.
- CORS responses name the allowed origin instead of `*`.

### For embedders

- `allowedOrigins` is enforced. 1.1.0 accepted it and ignored it.
- New `host` option. An `allowedOrigins` entry can end in `:*` for any port, or
  be `*` for every origin.
- New environment variables for the `tinyservice` command: `TINYSERVICE_HOST`
  and `TINYSERVICE_ALLOWED_ORIGINS` (comma-separated).

### tinyService Agent 1.1.0

- Ships tinyservice 1.2.0.
- A new icon for the installer, the app and the tray.
