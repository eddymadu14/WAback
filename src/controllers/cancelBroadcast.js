
import { cancelScheduledBroadcast } from "../services/cancelBroadcast.js";
import { logger } from "../utils/logger.js";

export const cancelBroadcast = async (req, res) => {
  try {
    const { broadcastId } = req.params;

    if (!broadcastId) {
      return res.status(400).json({ error: "Broadcast ID is required" });
    }

    const broadcast = await cancelScheduledBroadcast(broadcastId);

    logger.info(`Broadcast ${broadcastId} canceled`);

    res.json({
      success: true,
      status: "canceled",
      broadcastId: broadcast._id,
    });
  } catch (err) {
    logger.error(`Cancel broadcast failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
