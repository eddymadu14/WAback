
import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    phone: { type: String, required: true, index: true },
    name: { type: String, default: "" },

    // Last incoming message
    message: { type: String, required: true },

    // Intent tracking
    keywordHitCount: { type: Number, default: 0 },
    isSerious: { type: Boolean, default: false },
    hotPoints: { type: Number, default: 0 },

    // AutoReply traceability
    autoReplyId: { type: mongoose.Schema.Types.ObjectId, ref: "AutoReply" },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },
    triggerKeyword: { type: String },
    matchedSynonym: { type: String, default: null },

    // Sales state
    status: {
      type: String,
      enum: ["pending", "contacted", "converted", "cold"],
      default: "pending",
    },

    lastReplyMessage: { type: String, default: "" },
    lastInteractionAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

leadSchema.index({ userId: 1, phone: 1 }, { unique: true });

export const Lead = mongoose.model("Lead", leadSchema);
