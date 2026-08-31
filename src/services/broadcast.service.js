
import Broadcast from "../models/Broadcast.js";
import {
  isWhatsAppReady,
} from "./whatsapp.manager.js";
import { sendMessage } from "./whatsapp.send.js";
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
   * Runtime WhatsApp state is the authority.
   */
  if (!isWhatsAppReady(userId)) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }


  let sentCount = 0;
  let failedCount = 0;


  for (
    const contactObj of broadcast.contacts
  ) {
    /*
     * Never resend a contact that was already
     * successfully delivered.
     */
    if (
      contactObj.status === "sent"
    ) {
      sentCount++;
      continue;
    }

    try {
      await sendMessage(
        userId,
        contactObj.contact,
        broadcast.message
      );

      contactObj.status = "sent";
      contactObj.sentAt = new Date();

      sentCount++;

      /*
       * Persist progress after every successful
       * recipient.
       */
      await broadcast.save();
    } catch (error) {
      contactObj.status = "failed";

      failedCount++;

      logger.error(
        `[Broadcast:${broadcast._id}] Failed for ${contactObj.contact}: ${error.message}`
      );

      /*
       * Save the failure but continue with the
       * remaining recipients.
       */
      await broadcast.save();
    }
  }


  const hasPending =
    broadcast.contacts.some(
      (contact) =>
        contact.status === "pending"
    );


  /*
   * If everything was sent successfully.
   */
  if (
    !hasPending &&
    failedCount === 0
  ) {
    broadcast.status = "sent";
    broadcast.isScheduled = false;
    broadcast.sentAt = new Date();
  }

  /*
   * Some contacts failed.
   */
  else if (
    !hasPending &&
    failedCount > 0
  ) {
    broadcast.status = "failed";
    broadcast.isScheduled = false;
    broadcast.sentAt = new Date();
  }

  /*
   * There are still pending recipients.
   *
   * Keep the broadcast schedulable.
   */
  else {
    broadcast.status = "pending";
  }


  await broadcast.save();


  logger.info(
    `[Broadcast:${broadcast._id}] Completed: sent=${sentCount}, failed=${failedCount}, status=${broadcast.status}`
  );


  return {
    broadcastId:
      broadcast._id,
    sentCount,
    failedCount,
    status:
      broadcast.status,
  };
}
