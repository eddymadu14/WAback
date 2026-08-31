import Broadcast from "../models/Broadcast.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import { logger } from "../utils/logger.js";

export const startBroadcastScheduler = () => {
  setInterval(async () => {
    const now = new Date();

    const dueBroadcasts = await Broadcast.find({
      isScheduled: true,
      status: "pending",
      scheduledFor: { $lte: now },
    });

    for (const broadcast of dueBroadcasts) {
      try {
        // 🔑 SINGLE SOURCE OF TRUTH
        await broadcastMessage(broadcast._id);

        // Mark scheduling completed
        broadcast.isScheduled = false;
        await broadcast.save();

        logger.info(
          `Scheduled broadcast ${broadcast._id} sent for user ${broadcast.userId}`
        );
      } catch (err) {
        logger.error(
          `Failed scheduled broadcast ${broadcast._id}: ${err.message}`
        );
      }
    }
  }, 60 * 1000);
};