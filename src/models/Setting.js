
import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    auto_reply_enabled: { type: Boolean, default: true },
    serious_keywords: { type: [String], default: [] },
    allowGroupAutoReply: { type: Boolean, default: false }, // new toggle

    business_hours_enabled: { type: Boolean, default: false },
    business_hours_start: { type: String, default: "09:00" },
    business_hours_end: { type: String, default: "18:00" },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", SettingsSchema);
