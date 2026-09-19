// WebSocket configuration
export const WS_URL = "ws://localhost:3000";

// Board configuration
// tinyCore ESP32-S3 with default settings:
// - Upload Mode: UART0 / Hardware CDC
// - USB Mode: Hardware CDC and JTAG
export const TINYCORE_FQBN = "tinyCore:esp32:tiny_core_esp32s3_nopsram";

// Sketch path - using absolute path for the blink example
// Note: In production, this would need to be properly resolved
export const BLINK_SKETCH_PATH =
  "D:/repos/tinyService/packages/client/src/assets/blink";

// Test configuration
export const TEST_TIMEOUT = 30000; // 30 seconds per test step
export const RECONNECT_INTERVAL = 3000; // 3 seconds
export const MAX_RECONNECT_ATTEMPTS = 5;
