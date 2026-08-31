// routes/broadcast.route.js
import express from "express";
import { createBroadcast } from "../controllers/broadcast.controller.js";
import { getBroadcastHistory } from "../controllers/broadcastHistory.js";
import { cancelBroadcast } from "../controllers/cancelBroadcast.js";
import { protect } from "../middlewares/authMiddleware1.js";

const router = express.Router();

// ----------------------------------
// SEND BROADCAST (AUTH REQUIRED)
// ----------------------------------
router.post("/", protect, createBroadcast);

// ----------------------------------
// GET BROADCAST HISTORY (AUTH REQUIRED)
// ----------------------------------
router.get("/history", protect, getBroadcastHistory);

// ----------------------------------
// CANCEL BROADCAST (AUTH REQUIRED)
// ----------------------------------
router.post("/:broadcastId/cancel", protect, cancelBroadcast);

export default router;