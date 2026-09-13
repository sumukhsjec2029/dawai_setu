import { ensureSeedData } from "./lib/seed";
import { logger } from "./lib/logger";

logger.info("Starting DAWAI-SETU seed process...");

try {
  await ensureSeedData();
  logger.info("Seed process completed successfully.");
  process.exit(0);
} catch (error) {
  logger.error({ error }, "Seed process failed.");
  process.exit(1);
}
