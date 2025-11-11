import { expect, test, vi } from "vitest";
import { logger } from "../config";
import { TinyService } from "../service";

test("Prints WebSocket endpoint to the console", async () => {
  const consoleLogSpy = vi.spyOn(console, "log");
  const service = new TinyService();

  // Wait for the service to start
  await new Promise<void>((resolve) => {
    service
      .start()
      .then(() => {
        // Give the server callback time to execute
        setTimeout(() => resolve(), 100);
      })
      .catch((error) => {
        logger.error("Failed to start TinyService:", error);
        resolve(); // Still resolve to continue the test
      });
  });

  // Check that console.log was called with a message containing the WebSocket endpoint
  expect(consoleLogSpy).toHaveBeenCalledWith(
    expect.stringContaining("WebSocket endpoint: ws://localhost:3000"),
  );

  consoleLogSpy.mockRestore();

  // Clean up: exit the process to stop the server
  // In a test environment, we should mock or properly stop the service
  // For now, we'll let the test framework handle cleanup
});
