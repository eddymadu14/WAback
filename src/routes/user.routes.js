import express from "express";
import { registerUser, authUser, getUserProfile, logout, refreshToken, changePassword, resetPassword} from "../controllers/user.controller.js";
import {protect} from "../middlewares/authMiddleware.js";
import { PLAN_CONFIG } from "../middlewares/planConfig.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { registerSchema } from "../validators/schemas/user.js";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from "../validators/schemas/auth.js";
//import { forgotPassword, resetPassword } from "../controllers/passwordController.js";
import { sendVerificationEmail, resendVerificationEmailController, verifyEmail } from "../controllers/email.controller.js";

const router = express.Router();

// ---------------------
// PUBLIC ROUTES
// ---------------------

// User registration
router.post("/register", validateRequest(registerSchema), registerUser);

// Login
router.post("/login", validateRequest(loginSchema), authUser);

// Logout
router.post("/logout", logout);

// Refresh token
router.post("/refresh", refreshToken);

// Forgot password
router.post("/forgot-password", validateRequest(forgotPasswordSchema), changePassword);

// Reset password
router.post("/reset/:token", (req, res, next) => {
  req.body.token = req.params.token; // map param to body for Joi
  next();
}, validateRequest(resetPasswordSchema), resetPassword);

// Resend verification email
router.post("/resend-verification", validateRequest(verifyEmailSchema), resendVerificationEmailController);

// Verify email
// router.get("/verify/:token", (req, res, next) => {
//   req.body.token = req.params.token; // map param to body for Joi
//   next();
// }, validateRequest(verifyEmailSchema), verifyEmail);
router.get("/verify/:token", verifyEmail);

// ---------------------
// PROTECTED ROUTES
// ---------------------

// Profile
router.get("/profile", protect, getUserProfile);


export default router;