
import Bottleneck from "bottleneck";
import { logger } from "../utils/logger.js";

/**
 * WhatsApp-safe message queue
 * - 1 message at a time
 * - 8–15s delay between messages
 */
export const limiter = new Bottleneck({
  maxConcurrent: 1,      // NEVER parallelize WhatsApp sends
  minTime: 8000          // base delay (ms)
});

/**
 * Add jitter (random delay) per job
 */
limiter.on("scheduled", (info) => {
  const jitter = Math.floor(Math.random() * 7000); // +0–7s
  info.options.delay = jitter;
});

/**
 * Error handling
 */
limiter.on("failed", async (error, jobInfo) => {
  logger.error(`Queue job failed: ${error.message}`);
  return null; // do NOT retry automatically (safer)
});

logger.info("Message queue initialized");
