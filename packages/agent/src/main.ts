// tinyService Agent — a windowless system-tray app that runs the TinyService
// backend (compile / upload / serial for tinyStudio in the browser).
//
// Think "Arduino Cloud Agent, but for tinyStudio": the user installs it once,
// it lives in the Windows hidden-icons tray, starts at login, and the hosted
// web app at app.tinystudio.cc talks to it over ws://localhost:3000.
//
// No windows are ever created. All UX is the tray icon, its context menu, and
// the occasional balloon notification.

import { app, Menu, Tray, dialog, nativeImage, shell } from 'electron'
import { TinyService } from '@mister-industries/tinyservice'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PORT = 3000
const STUDIO_URL = 'https://app.tinystudio.cc'
const HEALTH_URL = `http://localhost:${PORT}/health`
const RETRY_MS = 15_000

type ServiceState = 'starting' | 'running' | 'port-busy' | 'error'

let tray: Tray | null = null
let service: TinyService | null = null
let state: ServiceState = 'starting'
let retryTimer: NodeJS.Timeout | null = null

// ---------------------------------------------------------------------------
// Logging — the app has no console, so mirror everything to a log file the
// user can open from the tray menu ("Open log file").
// ---------------------------------------------------------------------------

const logDir = path.join(app.getPath('userData'), 'logs')
const logFile = path.join(logDir, 'tinyservice-agent.log')

function setupFileLogging(): void {
  mkdirSync(logDir, { recursive: true })
  // Truncate on each launch so the file never grows unbounded; one session of
  // history is what's useful for "why won't it flash" support questions.
  writeFileSync(logFile, `--- tinyService Agent ${app.getVersion()} started ${new Date().toISOString()} ---\n`)

  const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '') // drop ANSI colors
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      original(...args)
      try {
        const line = args.map((a) => (typeof a === 'string' ? strip(a) : JSON.stringify(a))).join(' ')
        appendFileSync(logFile, line + '\n')
      } catch {
        /* never let logging take the service down */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// arduino-cli resolution — the installer bundles arduino-cli.exe into
// resources/arduino-cli/ (see electron-builder.yml + scripts/fetch-arduino-cli.mjs).
// In dev, use the vendored copy fetched by `npm run fetch-cli`, falling back to
// whatever `arduino-cli` is on PATH.
// ---------------------------------------------------------------------------

function resolveArduinoCliPath(): string {
  const bin = process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'arduino-cli', bin)
    if (existsSync(bundled)) return bundled
    console.warn(`Bundled arduino-cli not found at ${bundled}; falling back to PATH`)
    return 'arduino-cli'
  }
  const platformDir = `${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch}`
  const vendored = path.join(__dirname, '..', 'vendor', 'arduino-cli', platformDir, bin)
  return existsSync(vendored) ? vendored : 'arduino-cli'
}

// ---------------------------------------------------------------------------
// Tiny settings store (first-run flag). Auto-launch itself is read live from
// the OS via app.getLoginItemSettings() so the checkbox never drifts.
// ---------------------------------------------------------------------------

const settingsFile = path.join(app.getPath('userData'), 'agent-settings.json')

function readSettings(): { firstRunDone?: boolean } {
  try {
    return JSON.parse(readFileSync(settingsFile, 'utf8'))
  } catch {
    return {}
  }
}

function writeSettings(s: { firstRunDone?: boolean }): void {
  try {
    writeFileSync(settingsFile, JSON.stringify(s))
  } catch (error) {
    console.warn('Could not persist agent settings:', error)
  }
}

function setAutoLaunch(enabled: boolean): void {
  // --autostart lets us skip the "I'm running!" balloon on login launches.
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--autostart'] })
}

// ---------------------------------------------------------------------------
// Service lifecycle
// ---------------------------------------------------------------------------

async function isTinyServiceAlreadyRunning(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function startService(): Promise<void> {
  state = 'starting'
  updateTray()
  try {
    service = new TinyService({ port: PORT, arduinoCliPath: resolveArduinoCliPath() })
    await service.start()
    state = 'running'
    console.info(`tinyService Agent: backend running on port ${PORT}`)
  } catch (error) {
    service = null
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'EADDRINUSE') {
      // Most likely the tinyStudio desktop app (which embeds its own copy) or
      // another agent instance. Wait politely and take over when it exits.
      state = 'port-busy'
      const friendly = await isTinyServiceAlreadyRunning()
      console.warn(
        friendly
          ? `Port ${PORT} already serves a tinyService (probably the tinyStudio desktop app). Waiting for it to exit...`
          : `Port ${PORT} is in use by another program. Retrying every ${RETRY_MS / 1000}s...`
      )
      retryTimer = setTimeout(() => void startService(), RETRY_MS)
    } else {
      state = 'error'
      console.error('tinyService failed to start:', error)
    }
  }
  updateTray()
}

async function restartService(): Promise<void> {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (service) {
    await service.stop().catch((e) => console.warn('Error stopping service:', e))
    service = null
  }
  await startService()
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function statusLabel(): string {
  switch (state) {
    case 'running':
      return `Running on port ${PORT}`
    case 'starting':
      return 'Starting…'
    case 'port-busy':
      return `Port ${PORT} busy — waiting to take over`
    case 'error':
      return 'Failed to start — see log file'
  }
}

function updateTray(): void {
  if (!tray) return
  tray.setToolTip(`tinyService — ${statusLabel()}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `tinyService Agent v${app.getVersion()}`, enabled: false },
      { label: statusLabel(), enabled: false },
      { type: 'separator' },
      { label: 'Open tinyStudio', click: () => void shell.openExternal(STUDIO_URL) },
      { label: 'Open log file', click: () => void shell.openPath(logFile) },
      {
        label: 'Start when I log in',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setAutoLaunch(item.checked)
      },
      { type: 'separator' },
      { label: 'Restart service', click: () => void restartService() },
      {
        label: 'Quit tinyService',
        click: () => {
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  // Bundled next to dist/ — see the "files" list in electron-builder.yml.
  const iconPath = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'tray.ico' : 'trayTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  updateTray()
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

// Only one agent — a second launch (e.g. clicking the Start-menu shortcut while
// it's already in the tray) just pings the existing instance.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    tray?.displayBalloon({
      title: 'tinyService is already running',
      content: `It lives here in the system tray. ${statusLabel()}.`
    })
  })

  // Keep running with zero windows (we never open any, but stay explicit).
  app.on('window-all-closed', () => {
    /* keep alive */
  })

  app.on('before-quit', () => {
    if (retryTimer) clearTimeout(retryTimer)
    void service?.stop().catch(() => {})
  })

  void app.whenReady().then(async () => {
    app.setAppUserModelId('cc.tinystudio.tinyservice')
    setupFileLogging()

    try {
      createTray()
    } catch (error) {
      // Without a tray the app would be an invisible zombie — surface and bail.
      dialog.showErrorBox('tinyService', `Could not create the tray icon:\n${String(error)}`)
      app.quit()
      return
    }

    // First run (fresh install): enable start-at-login by default and say hi.
    const settings = readSettings()
    const launchedAtLogin = process.argv.includes('--autostart')
    if (!settings.firstRunDone) {
      if (app.isPackaged) setAutoLaunch(true)
      writeSettings({ firstRunDone: true })
      tray?.displayBalloon({
        title: 'tinyService is running',
        content: 'tinyStudio in your browser can now build & flash boards. Find me in the hidden icons tray.'
      })
    } else if (!launchedAtLogin) {
      tray?.displayBalloon({ title: 'tinyService is running', content: statusLabel() })
    }

    await startService()
  })
}
