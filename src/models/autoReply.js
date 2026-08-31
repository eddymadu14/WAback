import mongoose from "mongoose";

const keywordSchema = new mongoose.Schema({
  word: { type: String, required: true },
  matchType: {
    type: String,
    enum: ["contains", "exact", "startsWith", "word"],
    default: "contains",
  },
  synonyms: { type: [String], default: [] }, // array of strings, supports multiple synonyms
});

const autoReplySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // rule name
    keywords: { type: [keywordSchema], default: [] },
    responseTemplate: { type: mongoose.Schema.Types.ObjectId, ref: "Template", required: true },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 100 },
    cooldownSeconds: { type: Number, default: 30 }, // per-rule cooldown, optional
  },
  { timestamps: true }
);

export const AutoReply = mongoose.model("AutoReply", autoReplySchema);