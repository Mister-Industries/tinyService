import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArduinoCliResult, PackageJobsState } from "@mister-industries/shared";
import {
  PackageJobBusyError,
  PackageJobsService,
  summarizeError,
} from "./package-jobs.service.js";

/** A job body that finishes when `finish` is called. */
function controllable(): {
  run: (onOutput: (chunk: string) => void) => Promise<ArduinoCliResult>;
  output: (chunk: string) => void;
  finish: (result: ArduinoCliResult) => void;
} {
  let out: (chunk: string) => void = () => {};
  let done: (result: ArduinoCliResult) => void = () => {};
  return {
    run: (onOutput) => {
      out = onOutput;
      return new Promise((resolve) => (done = resolve));
    },
    output: (chunk) => out(chunk),
    finish: (result) => done(result),
  };
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe("PackageJobsService", () => {
  it("refuses a second operation while one runs", async () => {
    const jobs = new PackageJobsService();
    const first = controllable();
    const running = jobs.run(
      { kind: "core-install", target: "esp32:esp32", label: "Installing esp32:esp32" },
      first.run
    );
    await tick();

    await assert.rejects(
      jobs.run(
        { kind: "core-install", target: "esp32:esp32", label: "Installing esp32:esp32" },
        () => Promise.resolve({ success: true, output: "" })
      ),
      (error: unknown) =>
        error instanceof PackageJobBusyError &&
        error.active.target === "esp32:esp32" &&
        /still running/.test(error.message)
    );

    first.finish({ success: true, output: "" });
    await running;
    assert.equal(jobs.isBusy(), false);
    // Free again.
    const second = await jobs.run(
      { kind: "lib-install", target: "Servo", label: "Installing Servo" },
      () => Promise.resolve({ success: true, output: "" })
    );
    assert.equal(second.success, true);
  });

  it("broadcasts progress and the final state", async () => {
    const jobs = new PackageJobsService();
    const states: PackageJobsState[] = [];
    jobs.onChange((s) => states.push(s));
    const job = controllable();
    const lines: string[] = [];
    const running = jobs.run(
      { kind: "core-install", target: "tinyCore:esp32", label: "Installing tinyCore" },
      job.run,
      (line) => lines.push(line)
    );
    await tick();
    job.output("\resp32:esp-x32@2405 10.00 MiB / 190.43 MiB    5.25%");
    await new Promise((r) => setTimeout(r, 300)); // past the throttle
    const mid = states[states.length - 1];
    assert.equal(mid.active?.current?.percent, 5.25);
    assert.equal(mid.active?.state, "running");

    job.output("\resp32:esp-x32@2405 downloaded\nPlatform tinyCore:esp32@2.0.0 installed\n");
    job.finish({ success: true, output: "" });
    await running;

    const end = states[states.length - 1];
    assert.equal(end.active, null);
    assert.equal(end.last?.state, "succeeded");
    assert.deepEqual(lines, [
      "esp32:esp-x32@2405 downloaded",
      "Platform tinyCore:esp32@2.0.0 installed",
    ]);
  });

  it("pauses and resumes discovery around platform changes only", async () => {
    const calls: string[] = [];
    const jobs = new PackageJobsService({
      pause: () => void calls.push("pause"),
      resume: () => void calls.push("resume"),
    });
    await jobs.run(
      { kind: "lib-install", target: "Servo", label: "Installing Servo" },
      () => Promise.resolve({ success: true, output: "" })
    );
    assert.deepEqual(calls, []);
    await jobs.run(
      {
        kind: "core-install",
        target: "esp32:esp32",
        label: "Installing esp32:esp32",
        changesPlatforms: true,
      },
      async () => {
        calls.push("install");
        return { success: false, output: "", error: "boom" };
      }
    );
    assert.deepEqual(calls, ["pause", "install", "resume"]);
  });

  it("records a failure with arduino-cli's own error line", async () => {
    const jobs = new PackageJobsService();
    await jobs.run(
      { kind: "core-install", target: "tinyCore:esp32", label: "Installing tinyCore" },
      () =>
        Promise.resolve({
          success: false,
          output:
            "Downloading index: x downloaded\nError during install: Platform 'tinyCore:esp32': platform is not available for your OS\n",
          error: "exit status 1",
        })
    );
    assert.match(jobs.getState().last?.error ?? "", /^Error during install: /);
  });

  it("runWhenIdle waits for the running job instead of failing", async () => {
    const jobs = new PackageJobsService();
    const first = controllable();
    const running = jobs.run(
      { kind: "core-install", target: "a:b", label: "Installing a:b" },
      first.run
    );
    await tick();
    let secondStarted = false;
    const queued = jobs.runWhenIdle(
      { kind: "core-install", target: "c:d", label: "Installing c:d" },
      async () => {
        secondStarted = true;
        return { success: true, output: "" };
      }
    );
    await tick();
    assert.equal(secondStarted, false);
    first.finish({ success: true, output: "" });
    await running;
    assert.equal((await queued).success, true);
    assert.equal(secondStarted, true);
  });

  it("summarizeError falls back to the last line", () => {
    assert.equal(
      summarizeError({ success: false, output: "a\nb\n", error: "" }),
      "b"
    );
  });
});
