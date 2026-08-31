import User from "../models/User.js";
import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import parseDuration from "parse-duration";
import jwt from "jsonwebtoken";

import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateAccessToken.js";
import { generateVerificationToken, sendVerificationEmail } from "./email.controller.js"; 
import { PLAN_CONFIG } from "../utils/planConfig.js";

/**
 * ========================
 * REGISTER USER
 * ========================
 */
export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email, and password are required");
  }

  const exists = await User.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const basePlan = PLAN_CONFIG.free;

  const user = await User.create({
    name,
    email,
    password,
    role: "user",
    plan: basePlan.plan,
    billingStatus: basePlan.billingStatus,
    limits: basePlan.limits,
    isVerified: false,
  });

  const token = generateVerificationToken(user._id);

  try {
    await sendVerificationEmail(user.email, token);
  } catch (err) {
    console.error("❌ Error sending verification email:", err.response?.body || err.message);
    return res.status(201).json({
      success: true,
      message: "User registered, but verification email failed to send",
    });
  }

  res.status(201).json({
    success: true,
    message: "User registered successfully. Verification email sent.",
  });
});

/**
 * ========================
 * LOGIN USER
 * ========================
 */
export const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  if (!user.isVerified) {
    const token = generateVerificationToken(user._id);

    try {
      await sendVerificationEmail(user.email, token);
    } catch (err) {
      console.error("❌ Error resending verification email:", err.response?.body || err.message);
      return res.status(403).json({
        message: "Account not verified. Failed to resend verification email.",
      });
    }

    return res.status(403).json({
      message: "Account not verified. Verification email resent successfully.",
    });
  }

  const accessToken = generateAccessToken(user._id);
  const rawRefresh = generateRefreshToken(user._id);

  user.refreshTokens.push({
    tokenHash: hashToken(rawRefresh),
    createdAt: new Date(),
    expiresAt: new Date(
      Date.now() + parseDuration(process.env.REFRESH_TOKEN_EXPIRES || "7d")
    ),
  });

  await user.save();

  res.cookie("refreshToken", rawRefresh, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/refresh",
  });

  res.json({
    token: accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      billingStatus: user.billingStatus,
      limits: user.limits,
    },
  });
});

/**
 * ========================
 * REFRESH TOKEN
 * ========================
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) {
    res.status(401);
    throw new Error("No refresh token");
  }

  const hash = hashToken(raw);

  const user = await User.findOne({
    "refreshTokens.tokenHash": hash,
    "refreshTokens.expiresAt": { $gt: new Date() },
  });

  if (!user) {
    res.status(403);
    throw new Error("Invalid refresh token");
  }

  user.refreshTokens = user.refreshTokens.filter(
    (t) => t.tokenHash !== hash
  );

  const newRaw = generateRefreshToken(user._id);

  user.refreshTokens.push({
    tokenHash: hashToken(newRaw),
    createdAt: new Date(),
    expiresAt: new Date(
      Date.now() + parseDuration(process.env.REFRESH_TOKEN_EXPIRES || "7d")
    ),
  });

  await user.save();

  res.cookie("refreshToken", newRaw, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/refresh",
  });

  res.json({ token: generateAccessToken(user._id) });
});

/**
 * ========================
 * LOGOUT
 * ========================
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  res.json({ success: true, message: "Logged out" });
});

/**
 * ========================
 * PROFILE
 * ========================
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -refreshTokens");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.json(user);
});

/**
 * ========================
 * CHANGE PASSWORD
 * ========================
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    res.status(400);
    throw new Error("Old and new password required");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    res.status(401);
    throw new Error("Old password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password updated successfully" });
});

/**
 * ========================
 * RESET PASSWORD
 * ========================
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { password, token } = req.body;
  if (!password || !token) {
    res.status(400);
    throw new Error("Password and reset token required");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.password = password;
  await user.save();

  res.json({ success: true, message: "Password reset successfully" });
});