import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { InstallProgressParser } from "./install-progress.js";

// Real output of `arduino-cli core install tinyCore:esp32` (arduino-cli 1.5.1,
// stdout piped, text format), from "Downloading packages..." on.
const TINYCORE_INSTALL = readFileSync(
  new URL("./__fixtures__/core-install-tinycore.txt", import.meta.url),
  "utf8"
);

describe("InstallProgressParser", () => {
  it("reads download percentage from carriage-return frames", () => {
    const p = new InstallProgressParser();
    const lines = p.feed(
      "Downloading packages...\n" +
        "\resp32:esp-rv32@2601 0 B / 590.04 MiB    0.00%" +
        "\resp32:esp-rv32@2601 30.00 MiB / 590.04 MiB    5.08% 00m41s"
    );
    assert.deepEqual(lines, []); // progress frames are not log lines
    assert.deepEqual(p.snapshot().current, {
      item: "esp32:esp-rv32@2601",
      phase: "downloading",
      percent: 5.08,
      total: "590.04 MiB",
    });
  });

  it("follows a real install through download and install", () => {
    const p = new InstallProgressParser();
    const lines: string[] = [];
    // Feed in awkward chunks, as a pipe would deliver them.
    for (let i = 0; i < TINYCORE_INSTALL.length; i += 37) {
      lines.push(...p.feed(TINYCORE_INSTALL.slice(i, i + 37)));
    }
    lines.push(...p.end());

    const state = p.snapshot();
    assert.equal(state.current, undefined, "nothing in progress at the end");
    assert.ok(state.done.includes("tinyCore:esp32@2.0.0"));
    assert.ok(state.done.includes("esp32:esptool_py@4.9.dev3"));
    assert.equal(state.lastLine, "Platform tinyCore:esp32@2.0.0 installed");
    assert.ok(lines.includes("Installing platform tinyCore:esp32@2.0.0..."));
    assert.ok(!lines.some((l) => l.includes("%")), "no progress frames in log");
    assert.ok(!lines.includes("Downloading packages..."), "noise filtered");
  });

  it("tracks the installing phase", () => {
    const p = new InstallProgressParser();
    p.feed("Installing esp32:esp-x32@2405...\n");
    assert.deepEqual(p.snapshot().current, {
      item: "esp32:esp-x32@2405",
      phase: "installing",
    });
    p.feed("esp32:esp-x32@2405 installed\n");
    assert.equal(p.snapshot().current, undefined);
  });

  it("understands library installs", () => {
    const p = new InstallProgressParser();
    p.feed("Downloading Servo@1.2.2...\nInstalling Servo@1.2.2...\n");
    assert.equal(p.snapshot().current?.item, "Servo@1.2.2");
    p.feed("Installed Servo@1.2.2\n");
    assert.deepEqual(p.snapshot().done, ["Servo@1.2.2"]);
  });

  it("keeps error lines as the last line", () => {
    const p = new InstallProgressParser();
    p.feed(
      "Error during install: Platform 'tinyCore:esp32': platform is not available for your OS\n"
    );
    assert.match(p.snapshot().lastLine ?? "", /not available for your OS/);
  });
});
