
import express from "express";
import {Lead } from "../models/Lead.js";
import { protect } from "../middlewares/authMiddleware1.js";

const router = express.Router();

// Get all leads for logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const leads = await Lead.find({ userId: req.user._id }).sort({ lastInteractionAt: -1 });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// Update lead status
router.patch("/:id", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.user._id });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    lead.status = status;
    await lead.save();
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: "Failed to update lead" });
  }
});

export default router;
