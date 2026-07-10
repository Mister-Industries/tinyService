# tinyService Agent

A windowless system-tray app that runs the TinyService backend so
[tinyStudio in the browser](https://app.tinystudio.cc) can compile, upload,
and open serial monitors — no Node, no npx, no Arduino CLI setup.

Users download one installer, click it, and a ⚡ icon appears in the Windows
hidden-icons tray. The agent:

- runs `TinyService` on `ws://localhost:3000` (same backend the desktop app embeds)
- bundles its own `arduino-cli.exe` (no PATH setup required)
- starts at login by default (toggle in the tray menu)
- waits politely if port 3000 is busy (e.g. tinyStudio desktop is running) and
  takes over when it frees up

## Download

Stable link, always the latest release:

```
https://github.com/Mister-Industries/tinyService/releases/latest/download/tinyService-Setup.exe
```

## Development

```bash
# from the monorepo root
npm install
npm run build:shared && npm run build:service

cd packages/agent
npm run fetch-cli   # vendor arduino-cli for your platform
npm run dev         # bundle + launch Electron
```

The main process (`src/main.ts`) is bundled with esbuild into `dist/main.cjs`
(dependencies included), so the packaged app ships no `node_modules`.

## Building the installer

Locally on Windows: `npm run dist:win` → `release/tinyService-Setup.exe`.

CI: push a tag like `agent-v1.0.0` (or run the "Release tinyService Agent"
workflow manually). `.github/workflows/release-agent.yml` builds on
`windows-latest` and publishes the installer to GitHub Releases with the
stable `tinyService-Setup.exe` asset name.

Remember to bump `version` in `packages/agent/package.json` when tagging —
that's the version shown in the tray menu and the installer metadata.
