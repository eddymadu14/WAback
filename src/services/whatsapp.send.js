import { limiter } from "./messageQueue.js";
import { getClient, waitForClientReady } from "./whatsapp.manager.js";
import { logger } from "../utils/logger.js";

/**
 * Send a single message
 */
export async function sendMessage(userId, to, message) {
  try {
    await waitForClientReady(userId);

    const client = getClient(userId);
    if (!client) throw new Error("WhatsApp client not connected");

    await limiter.schedule(() => client.sendMessage(to, message));

    logger.info(`[WA:${userId}] Message sent to ${to}`);
  } catch (err) {
    logger.error(`[WA:${userId}] Failed to send message: ${err.message}`);
    throw err;
  }
}

/**
 * Send a broadcast to multiple recipients
 */
export async function sendBroadcast(userId, recipients = [], message) {
  try {
    await waitForClientReady(userId);

    const client = getClient(userId);
    if (!client) throw new Error("WhatsApp client not connected");

    for (const to of recipients) {
      await limiter.schedule(() => client.sendMessage(to, message));
      logger.info(`[WA:${userId}] Broadcast sent to ${to}`);
    }
  } catch (err) {
    logger.error(`[WA:${userId}] Broadcast failed: ${err.message}`);
    throw err;
  }
}