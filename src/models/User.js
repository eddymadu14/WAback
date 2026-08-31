import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    // -------------------
    // Core identity
    // -------------------
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    // -------------------
    // Plan & billing
    // -------------------
    plan: {
      type: String,
      enum: ['free', 'min', 'max'],
      default: 'free',
    },

    billingStatus: {
      type: String,
      enum: ['active', 'inactive', 'trial', 'cancelled'],
      default: 'inactive',
    },

    // -------------------
    // Usage limits
    // -------------------
    limits: {
      broadcasts: { type: Number, default: 3 }, // free plan default
      templates: { type: Number, default: 5 },
      autoReplies: { type: Number, default: 3 },
    },

    // -------------------
    // WhatsApp context
    // -------------------
    activeWaSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppSession',
      default: null,
    },

    // -------------------
    // Product lifecycle
    // -------------------
    onboardingCompleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date },

    // -------------------
    // Auth & security
    // -------------------
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    refreshTokens: [
      {
        tokenHash: String,
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date,
        ip: String,
        userAgent: String,
      },
    ],
  },
  { timestamps: true }
);

// -------------------
// Password hashing before save
// -------------------
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return; // skip if password not changed
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// -------------------
// Compare password method
// -------------------
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// -------------------
// Generate password reset token
// -------------------
userSchema.methods.generateResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

  return resetToken;
};

// -------------------
// Optional: update last login
// -------------------
userSchema.methods.updateLastLogin = function () {
  this.lastLoginAt = new Date();
  return this.save();
};

const User = mongoose.model('User', userSchema);
export default User;