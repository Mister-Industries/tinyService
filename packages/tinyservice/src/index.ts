import { logger } from "./config";
import { TinyService } from "./service";

// Start the service
const service = new TinyService();
service.start().catch((error) => {
  logger.error("Failed to start TinyService:", error);
  process.exit(1);
});
