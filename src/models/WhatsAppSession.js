
import mongoose from "mongoose";

const WhatsAppSessionSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true,
      },

      /*
       * Runtime/UI state only.
       *
       * NOT authentication persistence.
       */
      connected: {
        type: Boolean,
        default: false,
      },

      hasSession: {
        type: Boolean,
        default: false,
      },

      requiresQR: {
        type: Boolean,
        default: true,
      },

      qr: {
        type: String,
        default: null,
      },

      state: {
        type: String,
        default: "DISCONNECTED",
      },

      lastError: {
        type: String,
        default: null,
      },

      lastAuthenticatedAt: {
        type: Date,
        default: null,
      },

      lastReadyAt: {
        type: Date,
        default: null,
      },

      lastSessionBackupAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.model(
  "WhatsAppSession",
  WhatsAppSessionSchema
);