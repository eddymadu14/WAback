
import express from "express";
import {
  getAutoReplies,
  saveAutoReply,
  toggleAutoReply,
  deleteAutoReply
  // add update, delete later
} from "../controllers/autoReply.controller.js";
import {protect} from "../middlewares/authMiddleware1.js";

const router = express.Router();

router.post("/",protect, saveAutoReply);
router.put("/:id", protect, saveAutoReply);
router.get("/", protect, getAutoReplies);
router.delete("/:id", protect, deleteAutoReply);
router.patch("/:id/toggle", protect, toggleAutoReply);



export default router;


