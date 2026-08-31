// src/models/Template.js
import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
    // Link template to a specific user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Template name
    name: {
      type: String,
      required: true,
    },

    // Message content
    content: {
      type: String,
      required: true,
    },

    // Keywords that trigger this auto-reply
    keywords: {
      type: [String],
      default: [],
    },

    // Whether template is active
    is_active: {
      type: Boolean,
      default: true,
    },

    // Placeholders extracted from content, e.g., {firstName}
    placeholders: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export const Template = mongoose.model("Template", templateSchema);