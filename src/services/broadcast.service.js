import Broadcast from "../models/Broadcast.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import { sendMessage } from "./whatsapp.send.js";
import { logger } from "../utils/logger.js";

/**
 * Broadcast a message for a specific broadcastId
 * Each broadcast is tied to a userId
 */
export async function broadcastMessage(broadcastId) {
  const broadcast = await Broadcast.findById(broadcastId);

  if (!broadcast) {
    throw new Error("Broadcast not found");
  }

  const userId = broadcast.userId;

  // ✅ Check if user's WhatsApp is connected via DB
  const session = await WhatsAppSession.findOne({ userId });
  if (!session || !session.connected) {
    throw new Error("WhatsApp is not connected for this user");
  }

  let anyFailed = false;

  // ✅ Send messages using per-user client
  for (const contactObj of broadcast.contacts) {
    try {
      await sendMessage(userId, contactObj.contact, broadcast.message);
      contactObj.status = "sent";
      contactObj.sentAt = new Date();
    } catch (err) {
      contactObj.status = "failed";
      anyFailed = true;
      logger.error(
        `[Broadcast:${broadcast._id}] Failed to send to ${contactObj.contact}: ${err.message}`
      );
    }
  }

  broadcast.status = anyFailed ? "failed" : "sent";
  broadcast.sentAt = new Date();

  await broadcast.save();

  logger.info(
    `[Broadcast:${broadcast._id}] Completed for user ${userId} - Status: ${broadcast.status}`
  );
}