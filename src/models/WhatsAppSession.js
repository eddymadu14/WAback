
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
       * Runtime state.
       */
      connected: {
        type: Boolean,
        default: false,
      },

      /*
       * Whether the user has successfully linked
       * WhatsApp before.
       *
       * This is NOT the actual authentication data.
       *
       * Actual authentication is stored by:
       *
       * Development:
       *   LocalAuth filesystem
       *
       * Production:
       *   Supabase Storage
       */
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