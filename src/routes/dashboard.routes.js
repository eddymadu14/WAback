import express from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { protect } from "../middlewares/authMiddleware1.js";

const router = express.Router();

router.get("/analytics", protect, getDashboard);

export default router;
