
import mongoose from "mongoose";

const contactSchema =
  new mongoose.Schema({
    contact: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "sent",
        "failed",
      ],
      default: "pending",
    },

    sentAt: {
      type: Date,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },

    lastAttemptAt: {
      type: Date,
      default: null,
    },
  });

const broadcastSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      message: {
        type: String,
        required: true,
      },

      contacts: [
        contactSchema,
      ],

      status: {
        type: String,
        enum: [
          "pending",
          "sent",
          "failed",
          "canceled",
        ],
        default: "pending",
      },

      sentAt: {
        type: Date,
        default: null,
      },

      scheduledFor: {
        type: Date,
        required: false,
      },

      isScheduled: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.model(
  "Broadcast",
  broadcastSchema
);