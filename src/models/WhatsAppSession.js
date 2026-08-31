import mongoose from "mongoose";

const WhatsAppSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },

    // 🔑 Persist the actual WhatsApp auth/session payload
    session: {
      type: Object,
      default: null,
    },

    connected: { type: Boolean, default: false },
    requiresQR: { type: Boolean, default: true },
    qr: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("WhatsAppSession", WhatsAppSessionSchema);