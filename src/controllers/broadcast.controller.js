import Broadcast from "../models/Broadcast.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import { logger } from "../utils/logger.js";

/**
 * POST /api/broadcast
 * Send now OR schedule later
 */
export const createBroadcast = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const { message, schedule, recipients } = req.body;

    // ----------------------------
    // VALIDATION
    // ----------------------------
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message cannot be empty",
      });
    }

    if (!recipients || recipients.mode !== "manual") {
      return res.status(400).json({
        success: false,
        error: "Only manual recipients are supported for now",
      });
    }

    const contactList = recipients.manual || [];

    if (!Array.isArray(contactList) || contactList.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one recipient is required",
      });
    }

    // Normalize contacts ONCE
    const normalizedContacts = contactList.map((c) =>
      c.includes("@c.us") ? c : `${c}@c.us`
    );

    // ----------------------------
    // CREATE BROADCAST RECORD
    // ----------------------------
    const isScheduled = schedule?.mode === "later";

    const broadcast = await Broadcast.create({
      userId,
      message,
      contacts: normalizedContacts.map((c) => ({ contact: c })),
      isScheduled,
      scheduledFor: isScheduled ? new Date(schedule.time) : null,
      status: isScheduled ? "pending" : "pending",
    });

    // ----------------------------
    // SEND NOW
    // ----------------------------
    if (!isScheduled) {
      // fire & await immediate sending
      await broadcastMessage(broadcast._id);

      return res.json({
        success: true,
        status: "sent",
        broadcastId: broadcast._id,
      });
    }

    // ----------------------------
    // SEND LATER
    // ----------------------------
    return res.json({
      success: true,
      status: "scheduled",
      broadcastId: broadcast._id,
      scheduledFor: broadcast.scheduledFor,
    });
  } catch (err) {
    logger.error("Broadcast error:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "Broadcast failed",
    });
  }
};