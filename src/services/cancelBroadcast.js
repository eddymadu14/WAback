
import Broadcast from "../models/Broadcast.js";

export const cancelScheduledBroadcast = async (broadcastId) => {
  const broadcast = await Broadcast.findById(broadcastId);

  if (!broadcast) {
    throw new Error("Broadcast not found");
  }

  if (!broadcast.isScheduled || broadcast.status !== "pending") {
    throw new Error("Only pending scheduled broadcasts can be canceled");
  }

  broadcast.status = "canceled";
  broadcast.isScheduled = false;
  await broadcast.save();

  return broadcast;
};
