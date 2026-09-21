import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  materializeSketch,
  resolveSketch,
  sanitizeSketchName,
} from "./sketch-workspace.js";

/** What tinyStudio's collectBrowserSketch sends for an in-memory example. */
const example = (name: string): Record<string, string> => ({
  [`${name}.ino`]: "void setup() {}\nvoid loop() {}\n",
  "README.md": "# example\n",
  "circuit.json": "{}\n",
});

describe("sanitizeSketchName", () => {
  it("keeps the characters the Arduino IDE allows", () => {
    // Mirrors tinyStudio's toSketchName, which these names come from.
    assert.equal(sanitizeSketchName("blink-alternate"), "blink-alternate");
    assert.equal(sanitizeSketchName("blink-basic"), "blink-basic");
    assert.equal(sanitizeSketchName("v1.2-demo"), "v1.2-demo");
    assert.equal(sanitizeSketchName("fade.ino"), "fade");
  });

  it("replaces spaces and drops the rest", () => {
    assert.equal(sanitizeSketchName(" Long Distance Box "), "Long_Distance_Box");
    assert.equal(sanitizeSketchName("2 cool!! project"), "2_cool_project");
    assert.equal(sanitizeSketchName("--hidden"), "hidden");
    assert.equal(sanitizeSketchName("!!!"), "");
    assert.equal(sanitizeSketchName("x".repeat(80)).length, 63);
  });
});

describe("resolveSketch", () => {
  it("names the folder after the top-level .ino", () => {
    assert.deepEqual(resolveSketch(example("blink-alternate")), {
      folderName: "blink-alternate",
      mainIno: "blink-alternate.ino",
    });
  });

  it("prefers the .ino the caller named", () => {
    const files = { "a.ino": "", "b.ino": "" };
    assert.equal(resolveSketch(files, "b").mainIno, "b.ino");
    assert.equal(resolveSketch(files).mainIno, "a.ino");
  });

  it("falls back to the caller's name, then to 'sketch'", () => {
    assert.equal(resolveSketch({ "README.md": "" }, "my sketch").folderName, "my_sketch");
    assert.equal(resolveSketch({ "README.md": "" }).folderName, "sketch");
    assert.equal(resolveSketch({ "!!!.ino": "" }).folderName, "sketch");
  });

  it("ignores .ino files inside subfolders", () => {
    const files = { "lib/examples/demo/demo.ino": "", "top.ino": "" };
    assert.equal(resolveSketch(files).mainIno, "top.ino");
  });
});

describe("materializeSketch", () => {
  it("gives arduino-cli a folder whose main .ino matches it", async () => {
    // The bug: the folder was sanitized to blink_alternate while the file
    // stayed blink-alternate.ino, so arduino-cli reported
    // "main file missing from sketch".
    const { sketchPath, cleanup } = await materializeSketch(
      example("blink-alternate"),
      "blink-alternate"
    );
    try {
      const folder = sketchPath.split(/[\\/]/).pop();
      const entries = await readdir(sketchPath);
      assert.equal(folder, "blink-alternate");
      assert.ok(entries.includes(`${folder}.ino`), entries.join(", "));
      assert.ok(entries.includes("README.md"));
      assert.ok(entries.includes("circuit.json"));
    } finally {
      await cleanup();
    }
  });

  it("renames the main .ino when the folder name had to change", async () => {
    const { sketchPath, cleanup } = await materializeSketch(
      { "my sketch.ino": "", "data.h": "" },
      "my sketch"
    );
    try {
      const entries = await readdir(sketchPath);
      assert.equal(sketchPath.split(/[\\/]/).pop(), "my_sketch");
      assert.deepEqual(entries.sort(), ["data.h", "my_sketch.ino"]);
    } finally {
      await cleanup();
    }
  });

  it("leaves an existing file of that name alone", async () => {
    const files = { "blink-alternate.ino": "main", "blink_alternate.ino": "other" };
    const { sketchPath, cleanup } = await materializeSketch(files, "blink-alternate");
    try {
      const entries = await readdir(sketchPath);
      assert.deepEqual(entries.sort(), ["blink-alternate.ino", "blink_alternate.ino"]);
    } finally {
      await cleanup();
    }
  });

  it("keeps subfolders and refuses paths that escape the sketch", async () => {
    const { sketchPath, cleanup } = await materializeSketch({
      "demo.ino": "",
      "src/helper.h": "",
    });
    try {
      assert.deepEqual((await readdir(sketchPath)).sort(), ["demo.ino", "src"]);
    } finally {
      await cleanup();
    }
    await assert.rejects(
      () => materializeSketch({ "demo.ino": "", "../escape.txt": "" }),
      /Unsafe path/
    );
  });

  it("cleans up the whole temp tree", async () => {
    const { sketchPath, cleanup } = await materializeSketch(example("fade"));
    await cleanup();
    await assert.rejects(() => readdir(sketchPath));
  });
});
