import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ALLOWED_ORIGINS,
  isHostAllowed,
  isLoopbackAddress,
  isOriginAllowed,
  refusalReason,
} from "./access.js";

/** What tinyStudio's desktop app passes (src/main/index.ts). */
const TINYSTUDIO_DESKTOP = [
  "file://",
  "http://localhost:5173",
  "https://app.tinystudio.cc",
];

describe("isOriginAllowed", () => {
  it("lets through clients that send no Origin", () => {
    assert.equal(isOriginAllowed(undefined, DEFAULT_ALLOWED_ORIGINS), true);
    assert.equal(isOriginAllowed("", []), true);
  });

  it("allows tinyStudio and localhost pages by default", () => {
    for (const origin of [
      "https://app.tinystudio.cc",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:3000",
      "http://localhost",
    ]) {
      assert.equal(isOriginAllowed(origin, DEFAULT_ALLOWED_ORIGINS), true, origin);
    }
  });

  it("refuses other sites and look-alikes by default", () => {
    for (const origin of [
      "https://evil.example",
      "https://app.tinystudio.cc.evil.example",
      "http://app.tinystudio.cc",
      "http://localhost.evil.example",
      "http://localhost:3000.evil.example",
      "http://localhost:",
      "https://localhost:5173",
      "file://",
      "null",
    ]) {
      assert.equal(isOriginAllowed(origin, DEFAULT_ALLOWED_ORIGINS), false, origin);
    }
  });

  it("ignores case and a trailing slash", () => {
    assert.equal(
      isOriginAllowed("HTTPS://App.TinyStudio.cc/", DEFAULT_ALLOWED_ORIGINS),
      true
    );
  });

  it("matches exact entries such as file://", () => {
    assert.equal(isOriginAllowed("file://", TINYSTUDIO_DESKTOP), true);
    assert.equal(isOriginAllowed("http://localhost:5174", TINYSTUDIO_DESKTOP), false);
  });

  it("allows everything with *", () => {
    assert.equal(isOriginAllowed("https://evil.example", ["*"]), true);
  });
});

describe("isLoopbackAddress", () => {
  it("knows loopback from network addresses", () => {
    for (const a of ["127.0.0.1", "127.1.2.3", "localhost", "::1", "[::1]"]) {
      assert.equal(isLoopbackAddress(a), true, a);
    }
    for (const a of ["0.0.0.0", "::", "192.168.1.20", "127.0.0.1.evil.example"]) {
      assert.equal(isLoopbackAddress(a), false, a);
    }
  });
});

describe("isHostAllowed", () => {
  it("requires a name for this computer while bound to loopback", () => {
    for (const host of [
      "localhost:3000",
      "127.0.0.1:3000",
      "[::1]:3000",
      "tinystudio.localhost:3000",
      "LOCALHOST",
      undefined,
    ]) {
      assert.equal(isHostAllowed(host, "127.0.0.1"), true, String(host));
    }
    for (const host of [
      "evil.example:3000",
      "127.0.0.1.evil.example:3000",
      "localhost.evil.example",
      "192.168.1.20:3000",
    ]) {
      assert.equal(isHostAllowed(host, "127.0.0.1"), false, host);
    }
  });

  it("accepts any Host when bound to a network address", () => {
    assert.equal(isHostAllowed("192.168.1.20:3000", "0.0.0.0"), true);
  });
});

describe("refusalReason", () => {
  const options = { allowedOrigins: TINYSTUDIO_DESKTOP, host: "127.0.0.1" };

  it("accepts the tinyStudio desktop renderer and health check", () => {
    assert.equal(refusalReason({ origin: "file://", host: "localhost:3001" }, options), null);
    assert.equal(refusalReason({ host: "localhost:3001" }, options), null);
  });

  it("names the problem when refusing", () => {
    assert.match(
      refusalReason({ origin: "https://evil.example", host: "localhost:3000" }, options) ?? "",
      /origin "https:\/\/evil\.example"/
    );
    assert.match(
      refusalReason({ host: "rebound.evil.example:3000" }, options) ?? "",
      /host "rebound\.evil\.example:3000"/
    );
  });
});
