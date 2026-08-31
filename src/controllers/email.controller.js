// controllers/email.controller.js
import dotenv from "dotenv";
dotenv.config();
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import SibApiV3Sdk from "sib-api-v3-sdk";



// ================================
// JWT TOKEN GENERATOR
// ================================
export const generateVerificationToken = (userId) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not set");
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// ================================
// BREVO CLIENT SETUP (✅ CORRECT)
// ================================
const defaultClient = SibApiV3Sdk.ApiClient.instance;

// Authenticate API key
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Create email API instance
const brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();

// ================================
// SEND VERIFICATION EMAIL
// ================================
export const sendVerificationEmail = async (recipientEmail, token) => {
  if (!recipientEmail) throw new Error("Recipient email missing");
  if (!process.env.BASE_URL) throw new Error("BASE_URL not set");

  const verifyUrl = `${process.env.BASE_URL}/api/users/verify/${token}`;

  const emailData = {
    sender: {
      name: "NoReply",
      email: process.env.BREVO_SENDER_EMAIL,
    },
    to: [{ email: recipientEmail }],
    subject: "Verify your email address",
    htmlContent: `
      <h2>Email Verification</h2>
      <p>Click the link below to verify your account:</p>
      <a href="${verifyUrl}">${verifyUrl}</a>
      <p>This link will expire in 1 hour.</p>
    `,
  };

  try {
    await brevoClient.sendTransacEmail(emailData);
    console.log(`✅ Verification email sent to ${recipientEmail}`);
  } catch (err) {
    console.error("❌ Error sending verification email:", err);
    throw err;
  }
};

// ================================
// RESEND VERIFICATION EMAIL
// ================================
export const resendVerificationEmailController = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    const token = generateVerificationToken(user._id);
    await sendVerificationEmail(user.email, token);

    res.json({ message: "Verification email resent successfully" });
  } catch (err) {
    next(err);
  }
};



// ================================
// VERIFY EMAIL CONTROLLER (Robust Version)
// ================================


export const verifyEmail = async (req, res) => {
  try {
    // 1️⃣ Ensure token exists in route
    const { token } = req.params;
    if (!token) {
      console.error("❌ Verification token missing in request");
      return res.redirect(`${process.env.FRONTEND_URL}/verify-failed`);
    }

    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET not set in env");
      return res.redirect(`${process.env.FRONTEND_URL}/verify-failed`);
    }

    // 2️⃣ Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("❌ Token invalid or expired:", err.message);
      return res.redirect(`${process.env.FRONTEND_URL}/verify-failed`);
    }

    // 3️⃣ Find the user by decoded id
    const user = await User.findById(decoded.id);
    if (!user) {
      console.error(`❌ No user found for token id: ${decoded.id}`);
      return res.redirect(`${process.env.FRONTEND_URL}/verify-failed`);
    }

    // 4️⃣ Already verified?
    if (user.isVerified) {
      console.log(`ℹ️ User ${user.email} already verified`);
      return res.redirect(`${process.env.FRONTEND_URL}/verify-success`);
    }

    // 5️⃣ Mark user as verified
    user.isVerified = true;
    await user.save();

    console.log(`✅ User ${user.email} verified successfully`);
    return res.redirect(`${process.env.FRONTEND_URL}/verify-success`);
  } catch (err) {
    console.error("❌ Unexpected error in verifyEmail controller:", err);
    return res.redirect(`${process.env.FRONTEND_URL}/verify-failed`);
  }
};