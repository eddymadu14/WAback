
import express from "express";
import {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from "../controllers/templates.controller.js";

import {protect} from "../middlewares/authMiddleware1.js";

const router = express.Router();

// CRUD endpoints
router.post("/",protect, createTemplate);          // Create
router.get("/",protect, getTemplates);            // Get all
router.get("/:id",protect, getTemplateById);      // Get one
router.put("/:id",protect, updateTemplate);       // Update
router.delete("/:id",protect, deleteTemplate);    // Delete

export default router;
