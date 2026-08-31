
import { limiter } from "./messageQueue.js";
import {
  getClient,
  waitForClientReady,
  isWhatsAppReady,
} from "./whatsapp.manager.js";
import { logger } from "../utils/logger.js";


function normalizeRecipient(to) {
  if (!to) {
    throw new Error("Recipient is required");
  }

  return String(to).trim();
}


/**
 * Send one WhatsApp message.
 */
export async function sendMessage(
  userId,
  to,
  message
) {
  const recipient =
    normalizeRecipient(to);

  if (!message) {
    throw new Error("Message is required");
  }

  if (!isWhatsAppReady(userId)) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }

  const client =
    getClient(userId);

  if (!client) {
    throw new Error(
      `WhatsApp client unavailable for user ${userId}`
    );
  }

  try {
    await waitForClientReady(
      userId,
      5_000
    );

    await limiter.schedule(
      () =>
        client.sendMessage(
          recipient,
          message
        )
    );

    logger.info(
      `[WA:${userId}] Message sent to ${recipient}`
    );
  } catch (error) {
    logger.error(
      `[WA:${userId}] Failed to send message to ${recipient}: ${error.message}`
    );

    throw error;
  }
}


/**
 * Send broadcast messages.
 *
 * Each recipient is processed independently.
 *
 * Returns a result instead of hiding failures.
 */
export async function sendBroadcast(
  userId,
  recipients = [],
  message
) {
  if (!Array.isArray(recipients)) {
    throw new Error(
      "Recipients must be an array"
    );
  }

  if (!recipients.length) {
    return {
      sent: [],
      failed: [],
    };
  }

  if (!isWhatsAppReady(userId)) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }

  const client =
    getClient(userId);

  if (!client) {
    throw new Error(
      `WhatsApp client unavailable for user ${userId}`
    );
  }

  await waitForClientReady(
    userId,
    5_000
  );

  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    try {
      const normalized =
        normalizeRecipient(recipient);

      await limiter.schedule(
        () =>
          client.sendMessage(
            normalized,
            message
          )
      );

      sent.push(normalized);

      logger.info(
        `[WA:${userId}] Broadcast sent to ${normalized}`
      );
    } catch (error) {
      failed.push({
        recipient,
        error: error.message,
      });

      logger.error(
        `[WA:${userId}] Broadcast failed for ${recipient}: ${error.message}`
      );
    }
  }

  return {
    sent,
    failed,
  };
}