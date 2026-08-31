import express from "express";
import protect from "../middlewares/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { registerSchema } from "../validators/schema/user.js"; // reuse or create admin-specific schema
import {
  registerAdmin,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
} from "../controllers/adminController.js";

const router = express.Router();

// ---------------------
// ADMIN PROTECTED ROUTES
// ---------------------

// Only admins can create new admins
router.post("/register", protect, validateRequest(registerSchema), registerAdmin);

// Users CRUD
router.get("/users", protect, listUsers);
router.get("/users/:id", protect, getUser);
router.patch("/users/:id", protect, updateUser);
router.delete("/users/:id", protect, deleteUser);

export default router;