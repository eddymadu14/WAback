
import Broadcast from "../models/Broadcast.js";

import {
  isWhatsAppReady,
} from "./whatsapp.manager.js";

import {
  sendMessage,
} from "./whatsapp.send.js";

import { logger } from "../utils/logger.js";

export async function broadcastMessage(
  broadcastId
) {
  const broadcast =
    await Broadcast.findById(
      broadcastId
    );

  if (!broadcast) {
    throw new Error(
      "Broadcast not found"
    );
  }

  const userId =
    String(broadcast.userId);

  /*
   * Runtime WhatsApp state is the
   * only authority.
   */
  if (
    !isWhatsAppReady(userId)
  ) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }

  let sentCount = 0;
  let failedCount = 0;

  for (
    const contactObj of
    broadcast.contacts
  ) {
    /*
     * Already delivered.
     */
    if (
      contactObj.status === "sent"
    ) {
      sentCount++;
      continue;
    }

    /*
     * Check before every recipient.
     *
     * If WhatsApp disconnects halfway through
     * the broadcast, stop immediately.
     */
    if (
      !isWhatsAppReady(userId)
    ) {
      logger.warn(
        `[Broadcast:${broadcast._id}] WhatsApp disconnected. Pausing broadcast.`
      );

      break;
    }

    try {
      await sendMessage(
        userId,
        contactObj.contact,
        broadcast.message
      );

      contactObj.status =
        "sent";

      contactObj.sentAt =
        new Date();

      sentCount++;

      /*
       * Persist immediately.
       *
       * If Node crashes at recipient #50,
       * recipients #1-49 remain sent and
       * the next run starts from #50.
       */
      await broadcast.save();

    } catch (error) {

      
contactObj.attempts =
  (contactObj.attempts || 0) + 1;

contactObj.lastError =
  error.message;

contactObj.lastAttemptAt =
  new Date();

contactObj.status = "pending";
      failedCount++;

  

      await broadcast.save();

      logger.error(
        `[Broadcast:${broadcast._id}] Failed for ${contactObj.contact}: ${error.message}`
      );

      /*
       * If WhatsApp itself went down, stop
       * processing this broadcast immediately.
       */
      if (
        !isWhatsAppReady(userId)
      ) {
        break;
      }
    }
  }

  const pending =
    broadcast.contacts.some(
      (contact) =>
        contact.status ===
        "pending"
    );

  const allSent =
    broadcast.contacts.length > 0 &&
    broadcast.contacts.every(
      (contact) =>
        contact.status === "sent"
    );

  if (allSent) {
    broadcast.status =
      "sent";

    broadcast.isScheduled =
      false;

    broadcast.sentAt =
      new Date();
  } else if (pending) {
    /*
     * Keep it alive.
     */
    broadcast.status =
      "pending";

    broadcast.isScheduled =
      true;
  }

  await broadcast.save();

  logger.info(
    `[Broadcast:${broadcast._id}] Result: sent=${sentCount}, failed=${failedCount}, pending=${broadcast.contacts.filter(
      (c) => c.status === "pending"
    ).length}, status=${broadcast.status}`
  );

  return {
    broadcastId:
      broadcast._id,

    sentCount,

    failedCount,

    pendingCount:
      broadcast.contacts.filter(
        (c) =>
          c.status === "pending"
      ).length,

    status:
      broadcast.status,
  };
}