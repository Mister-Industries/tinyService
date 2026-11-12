# Changelog

## tinyservice 1.3.0, shared 1.3.0 and tinyService Agent 1.1.1 — not released

### Boards

- **Automatic board setup.** When tinyService starts it adds Espressif's and
  the tinyCore board-manager URLs, refreshes the board index once a day (as the
  Arduino IDE does), and installs tinyCore, then Espressif's ESP32 package
  (every other ESP32 board, SparkFun's included). tinyCore goes first because
  it is about a third of the size, so it is ready long before the rest. A
  platform is installed automatically only once: one you uninstall stays
  uninstalled. `install-cores` runs the setup again and installs anything
  missing. Turn it off with `autoSetup: false` or `TINYSERVICE_AUTO_SETUP=0`;
  choose the platforms with `setupPlatforms` / `TINYSERVICE_SETUP_PLATFORMS`
  and the URLs with `boardManagerUrls` / `TINYSERVICE_BOARD_URLS`.
- **One package operation at a time, with progress.** Platform and library
  installs and uninstalls and board-URL changes run one at a time; a request
  that arrives while one runs gets an error with `busy: true` and the running
  job. Their state, with arduino-cli's download progress parsed per item, is
  pushed to every client as `package-jobs` (on connect and on every change).
  The requesting client also gets the finished output lines.
- Installs have no time limit. An install is stopped only after 15 minutes
  with no output at all.
- Board discovery is paused while a platform is installed or removed and
  restarted afterwards (as the Arduino IDE does), so boards that are already
  plugged in are identified with the new platforms. Clients see boards change
  identity rather than briefly disappear.
- Adding a board-manager URL succeeds when that URL's index arrives, even if
  another configured index can't be reached.

### Changed

- Board detection reports what arduino-cli found and nothing more. Every
  board that matches a port is listed (real boards first, then discovery
  placeholders flagged `isHidden`), with the port's USB `vid`, `pid` and
  `serialNumber`. tinyCore is no longer preferred over other matches, an
  Espressif USB id is no longer assumed to be a tinyCore, and a CH340 adapter
  is no longer assumed to be an Arduino Uno: an unmatched USB device is listed
  with no FQBN. Choosing a default for those is up to the client.


### Fixed

- Libraries that depend on a library bundled with the board platform install.
  arduino-cli resolves dependencies only from the Library Manager index, so a
  library listing `Wire` or `SPI` (7Semi_BMI330, for one) failed with "No valid
  dependencies solution found: dependency 'Wire' is not available". tinyService
  now installs such a library with `--no-deps`, then installs each of its
  dependencies that the index has, and reports the ones it left to the
  platform.
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
