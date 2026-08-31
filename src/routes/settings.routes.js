
import express from "express";
import Settings from "../models/Setting.js";
import { protect } from "../middlewares/authMiddleware1.js";

const router = express.Router();

/**
 * GET user settings
 */
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user.id;

    let settings = await Settings.findOne({ userId });
    if (!settings) {
      settings = await Settings.create({ userId });
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch settings",
      error: err.message,
    });
  }
});

/**
 * UPDATE user settings
 */
router.put("/", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    let settings = await Settings.findOne({ userId });
    if (!settings) settings = new Settings({ userId });

    for (const key of Object.keys(updates)) {
      settings[key] = updates[key];
    }

    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({
      message: "Failed to update settings",
      error: err.message,
    });
  }
});

export default router;
