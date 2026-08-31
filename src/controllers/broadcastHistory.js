
import Broadcast from "../models/Broadcast.js";

export const getBroadcastHistory = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, broadcasts });
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
};