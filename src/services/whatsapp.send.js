
import {
  getClient,
  waitForClientReady,
  isWhatsAppReady,
} from "./whatsapp.manager.js";

import { limiter } from "./messageQueue.js";
import { logger } from "../utils/logger.js";

function normalizeRecipient(to) {
  if (!to) {
    throw new Error(
      "Recipient is required"
    );
  }

  return String(to).trim();
}

export async function sendMessage(
  userId,
  to,
  message
) {
  const recipient =
    normalizeRecipient(to);

  if (!message) {
    throw new Error(
      "Message is required"
    );
  }

  if (
    !isWhatsAppReady(userId)
  ) {
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

  try {
    return await limiter.schedule(
      async () => {
        /*
         * Recheck immediately before sending.
         *
         * WhatsApp can disconnect while a message
         * is waiting in the queue.
         */
        if (
          !isWhatsAppReady(userId)
        ) {
          throw new Error(
            `WhatsApp disconnected before sending to ${recipient}`
          );
        }

        const currentClient =
          getClient(userId);

        if (!currentClient) {
          throw new Error(
            "WhatsApp client unavailable"
          );
        }

        const result =
          await currentClient.sendMessage(
            recipient,
            message
          );

        logger.info(
          `[WA:${userId}] Message sent to ${recipient}`
        );

        return result;
      }
    );
  } catch (error) {
    logger.error(
      `[WA:${userId}] Send failed to ${recipient}: ${error.message}`
    );

    throw error;
  }
}

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

  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    try {
      await sendMessage(
        userId,
        recipient,
        message
      );

      sent.push(
        normalizeRecipient(recipient)
      );
    } catch (error) {
      failed.push({
        recipient,
        error: error.message,
      });
    }
  }

  return {
    sent,
    failed,
  };
}