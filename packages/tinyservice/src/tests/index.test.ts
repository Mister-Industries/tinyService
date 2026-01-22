import { afterEach, expect, test, vi } from "vitest";
import { logger } from "../config";
import { TinyService } from "../service";

let service: TinyService | null = null;

afterEach(async () => {
  if (service) {
    // Clean up the server after each test
    await service.stop();
    service = null;
  }
});

test("Starts service and logs WebSocket endpoint", async () => {
  const loggerInfoSpy = vi.spyOn(logger, "info");

  // Use a random available port to avoid conflicts
  const testPort = 3001 + Math.floor(Math.random() * 1000);
  service = new TinyService({ port: testPort });

  // Wait for the service to start
  await new Promise<void>((resolve, reject) => {
    service!
      .start()
      .then(() => {
        // Give the server callback time to execute
        setTimeout(() => resolve(), 200);
      })
      .catch((error) => {
        reject(error);
      });
  });

  // Check that logger.info was called with a message containing the WebSocket endpoint
  expect(loggerInfoSpy).toHaveBeenCalledWith(
    expect.stringContaining(`WebSocket endpoint: ws://localhost:${testPort}`),
  );

  loggerInfoSpy.mockRestore();
});
