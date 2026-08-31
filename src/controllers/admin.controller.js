
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import { PLAN_CONFIG } from "../utils/planConfig.js";
import {generateAccessToken} from '../utils/generateAccessToken.js';


/**
 * LIST USERS
 */
export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find({})
    .select("-password -refreshTokens")
    .sort({ createdAt: -1 });

  res.json(users);
});

/**
 * UPDATE USER (PLAN / ROLE / STATUS ONLY)
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { role, plan, billingStatus, isVerified } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (role) user.role = role;

  if (plan) {
    const config = PLAN_CONFIG[plan];
    if (!config) {
      res.status(400);
      throw new Error("Invalid plan");
    }

    user.plan = config.plan;
    user.billingStatus = config.billingStatus;
    user.limits = config.limits;
  }

  if (billingStatus) user.billingStatus = billingStatus;
  if (typeof isVerified === "boolean") user.isVerified = isVerified;

  await user.save();

  res.json({
    success: true,
    message: "User updated",
    user,
  });
});

/**
 * DELETE USER
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.json({ success: true, message: "User deleted" });
});

