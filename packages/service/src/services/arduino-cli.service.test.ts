import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexDownloaded } from "../handlers/board-manager.handler.js";
import {
  ArduinoCliService,
  isUnresolvableDependency,
  libraryDependencies,
  normalizeUsbId,
} from "./arduino-cli.service.js";

const cli = new ArduinoCliService();

/** An ESP32-S3 in Hardware CDC mode, as arduino-cli reports it. */
const esp32s3Port = {
  address: "/dev/cu.usbmodem1101",
  protocol: "serial",
  properties: { pid: "0x1001", vid: "0x303A", serialNumber: "F4:12:FA:AA:BB:CC" },
};

describe("detectedPortToBoards", () => {
  it("keeps every match, real boards before placeholders", () => {
    const boards = cli.detectedPortToBoards({
      port: esp32s3Port,
      matching_boards: [
        { name: "ESP32 Family Device", fqbn: "esp32:esp32:esp32_family", is_hidden: true },
        { name: "Ozobot DrvKit", fqbn: "esp32:esp32:ozobot_drvkit" },
        { name: "ESP32 Family Device", fqbn: "tinyCore:esp32:esp32_family", is_hidden: true },
      ],
    });
    assert.deepEqual(
      boards.map((b) => [b.fqbn, b.isHidden ?? false]),
      [
        ["esp32:esp32:ozobot_drvkit", false],
        ["esp32:esp32:esp32_family", true],
        ["tinyCore:esp32:esp32_family", true],
      ]
    );
  });

  it("does not prefer tinyCore over another platform's board", () => {
    // A real Adafruit Feather S3 matches both platforms on 239A:8113.
    const boards = cli.detectedPortToBoards({
      port: { ...esp32s3Port, properties: { vid: "0x239A", pid: "0x8113" } },
      matching_boards: [
        { name: "Adafruit Feather ESP32-S3 No PSRAM", fqbn: "esp32:esp32:adafruit_feather_esp32s3_nopsram" },
        { name: "tinyCore ESP32-S3 No PSRAM", fqbn: "tinyCore:esp32:tiny_core_esp32s3_nopsram" },
      ],
    });
    assert.equal(boards.length, 2);
    assert.equal(boards[0].fqbn, "esp32:esp32:adafruit_feather_esp32s3_nopsram");
  });

  it("passes the USB identity through", () => {
    const [board] = cli.detectedPortToBoards({
      port: esp32s3Port,
      matching_boards: [
        { name: "ESP32 Family Device", fqbn: "esp32:esp32:esp32_family", is_hidden: true },
      ],
    });
    assert.equal(board.vid, "0x303a");
    assert.equal(board.pid, "0x1001");
    assert.equal(board.serialNumber, "F4:12:FA:AA:BB:CC");
    assert.equal(board.port, "/dev/cu.usbmodem1101");
  });

  it("lists an unmatched USB device without guessing a board", () => {
    // Before any ESP32 platform is installed, and a CH340 adapter.
    for (const properties of [
      { vid: "0x303A", pid: "0x1001" },
      { vid: "0x1A86", pid: "0x7523" },
    ]) {
      const boards = cli.detectedPortToBoards({
        port: { ...esp32s3Port, properties },
        matching_boards: [],
      });
      assert.equal(boards.length, 1);
      assert.equal(boards[0].fqbn, "", "no tinyCore/Uno guess");
      assert.equal(boards[0].guess, true);
    }
  });

  it("skips ports that are not USB devices", () => {
    const boards = cli.detectedPortToBoards({
      port: { address: "/dev/cu.Bluetooth-Incoming-Port", protocol: "serial", properties: {} },
      matching_boards: [],
    });
    assert.deepEqual(boards, []);
  });
});

describe("normalizeUsbId", () => {
  it("normalizes case, prefix and width", () => {
    assert.equal(normalizeUsbId("0x303A"), "0x303a");
    assert.equal(normalizeUsbId("303a"), "0x303a");
    assert.equal(normalizeUsbId("0x2"), "0x0002");
    assert.equal(normalizeUsbId(undefined), "");
    assert.equal(normalizeUsbId("nope"), "");
  });
});


describe("indexDownloaded", () => {
  // `core update-index` output where Arduino's own index failed but the new
  // board URL's index arrived.
  const output =
    "Downloading index: package_index.tar.bz2 Download failed: performing HEAD request: dial tcp: no such host\n" +
    "Downloading index: package_slowtest_index.json 0 B / 1.2 KiB    0.00%\rDownloading index: package_slowtest_index.json downloaded\n" +
    "Some indexes could not be updated.\n";

  it("spots the new URL's index arriving", () => {
    assert.equal(indexDownloaded(output, "http://127.0.0.1:8766/package_slowtest_index.json"), true);
  });

  it("is false when that index failed", () => {
    assert.equal(indexDownloaded(output, "https://downloads.arduino.cc/packages/package_index.tar.bz2"), false);
    assert.equal(indexDownloaded(output, "https://example.com/package_other_index.json"), false);
  });
});

describe("library installs with platform dependencies", () => {
  const unresolvable = {
    success: false,
    output: "",
    error: "Error installing 7Semi_BMI330: No valid dependencies solution found: dependency 'Wire' is not available",
  };
  const search = JSON.stringify({
    libraries: [
      {
        name: "Fancy IMU",
        latest: {
          version: "2.0.0",
          dependencies: [{ name: "Wire" }, { name: "Adafruit BusIO" }, { name: "Fancy IMU" }],
        },
        releases: { "1.0.0": { version: "1.0.0", dependencies: [{ name: "SPI" }] } },
      },
    ],
  });

  it("recognises arduino-cli's unresolvable-dependency error", () => {
    assert.equal(isUnresolvableDependency(unresolvable), true);
    assert.equal(
      isUnresolvableDependency({ success: false, output: "", error: "library not found" }),
      false
    );
  });

  it("reads a library's dependencies from lib search output", () => {
    assert.deepEqual(libraryDependencies(search, "Fancy IMU"), ["Wire", "Adafruit BusIO"]);
    assert.deepEqual(libraryDependencies(search, "Fancy IMU", "1.0.0"), ["SPI"]);
    assert.deepEqual(libraryDependencies(search, "Other"), []);
    assert.deepEqual(libraryDependencies("not json", "Fancy IMU"), []);
  });

  it("installs without deps, then each dependency the index has", async () => {
    const svc = new ArduinoCliService();
    const calls: string[] = [];
    (svc as any).executeCommand = async (args: string[]) => {
      calls.push(args.join(" "));
      const [, cmd] = args;
      if (cmd === "search") return { success: true, output: search };
      if (args.includes("--no-deps")) return { success: true, output: "Installed Fancy IMU" };
      if (args[2] === "Fancy IMU") return unresolvable;
      if (args[2] === "Wire") return { success: false, output: "", error: "Library 'Wire' not found" };
      return { success: true, output: `Installed ${args[2]}` };
    };
    const lines: string[] = [];
    const r = await svc.installLibrary("Fancy IMU", undefined, (t) => lines.push(t));
    assert.equal(r.success, true);
    assert.deepEqual(calls, [
      "lib install Fancy IMU",
      "lib install --no-deps Fancy IMU",
      "lib search Fancy IMU --format json",
      "lib install Wire",
      "lib install Adafruit BusIO",
    ]);
    assert.match(r.output, /not installed: Wire/);
    assert.ok(lines.some((l) => /without it/.test(l)));
  });

  it("leaves other install failures alone", async () => {
    const svc = new ArduinoCliService();
    let n = 0;
    (svc as any).executeCommand = async () => {
      n++;
      return { success: false, output: "", error: "network down" };
    };
    const r = await svc.installLibrary("Fancy IMU", undefined);
    assert.equal(r.success, false);
    assert.equal(n, 1);
  });
});
