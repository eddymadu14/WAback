
import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  contact: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "sent", "failed"],
    default: "pending",
  },
  sentAt: { type: Date },
});

const broadcastSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    contacts: [contactSchema], // each contact has its own status
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "canceled"],
      default: "pending",
    },
    sentAt: { type: Date },
    scheduledFor: {type: Date, required: false},
    isScheduled: {type: Boolean, default: false},
  },
  { timestamps: true }
);

const Broadcast = mongoose.model("Broadcast", broadcastSchema);
export default Broadcast;
