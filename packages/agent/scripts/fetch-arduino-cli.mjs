// packages/agent/scripts/fetch-arduino-cli.mjs
//
// Downloads the official arduino-cli binary and drops it under
// vendor/arduino-cli/<platform>/, which electron-builder copies into the
// packaged agent's resources (see electron-builder.yml). Adapted from
// tinyStudio's scripts/fetch-arduino-cli.mjs.
//
// Idempotent: skips any platform whose binary already exists.
//
//   node scripts/fetch-arduino-cli.mjs               # host platform
//   node scripts/fetch-arduino-cli.mjs windows-x64   # specific target(s)

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pin to a known-good release so builds are reproducible. Bump deliberately.
const VERSION = '1.5.1'
const BASE = 'https://downloads.arduino.cc/arduino-cli'

const __dirname = dirname(fileURLToPath(import.meta.url))
const vendorRoot = join(__dirname, '..', 'vendor', 'arduino-cli')

// On Windows, prefer the OS-bundled bsdtar (zip-capable) over whatever `tar`
// the shell PATH resolves to (Git Bash ships GNU tar, which can't read .zip).
function tarExe() {
  if (process.platform === 'win32') {
    const sys = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    if (existsSync(sys)) return sys
  }
  return 'tar'
}

const TARGETS = {
  'windows-x64': { asset: `arduino-cli_${VERSION}_Windows_64bit.zip`, bin: 'arduino-cli.exe' },
  'macos-x64': { asset: `arduino-cli_${VERSION}_macOS_64bit.tar.gz`, bin: 'arduino-cli' },
  'macos-arm64': { asset: `arduino-cli_${VERSION}_macOS_ARM64.tar.gz`, bin: 'arduino-cli' },
  'linux-x64': { asset: `arduino-cli_${VERSION}_Linux_64bit.tar.gz`, bin: 'arduino-cli' },
  'linux-arm64': { asset: `arduino-cli_${VERSION}_Linux_ARM64.tar.gz`, bin: 'arduino-cli' }
}

function hostPlatform() {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  return `${os}-${process.arch}`
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function fetchOne(platform) {
  const target = TARGETS[platform]
  if (!target) throw new Error(`Unknown platform "${platform}". Valid: ${Object.keys(TARGETS).join(', ')}`)

  const outDir = join(vendorRoot, platform)
  const outBin = join(outDir, target.bin)
  if (existsSync(outBin)) {
    console.log(`✓ ${platform}: already present (${target.bin})`)
    return
  }

  mkdirSync(outDir, { recursive: true })
  const tmp = mkdtempSync(join(tmpdir(), 'arduino-cli-'))
  try {
    const archive = join(tmp, target.asset)
    console.log(`↓ ${platform}: downloading ${target.asset} ...`)
    await download(`${BASE}/${target.asset}`, archive)

    execFileSync(tarExe(), ['-xf', archive, '-C', tmp])
    const extracted = readdirSync(tmp).includes(target.bin)
      ? join(tmp, target.bin)
      : join(tmp, 'arduino-cli', target.bin) // some archives nest a directory
    copyFileSync(extracted, outBin)
    if (!target.bin.endsWith('.exe')) chmodSync(outBin, 0o755)
    console.log(`✓ ${platform}: ${outBin}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const requested = process.argv.slice(2)
const platforms = requested.length > 0 ? requested : [hostPlatform()]

for (const platform of platforms) {
  await fetchOne(platform)
}
