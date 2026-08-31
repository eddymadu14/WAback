import { autoReplyHandler } from "../services/autoreply.service.js";
import { evaluateAutoReplyIntent } from "../controllers/leads.controller.js";
import { resolveLeadFromIntent } from "../services/lead.service.js";

/**
 * Handles incoming WhatsApp messages:
 * - Runs auto-reply
 * - Evaluates intent
 * - Creates/updates leads
 * - Sends reply if applicable
 */
export async function handleIncomingMessage({ userId, client, msg }) {
  // 0️⃣ Ignore outgoing messages
  if (msg.fromMe) return { lead: null, autoReplied: false };

  // 1️⃣ Extract text
  const message = msg.body?.trim() || "";
  if (!message) return { lead: null, autoReplied: false };

  // 2️⃣ Extract phone from WhatsApp ID
  // WhatsApp ID format: "2348012345678@c.us"
  const phone = msg.from?.split("@")[0];
  if (!phone) return { lead: null, autoReplied: false };

  // 3️⃣ Run auto-reply logic (does not modify lead)
  await autoReplyHandler({ userId, client, msg });

  // 4️⃣ Evaluate intent
  const intent = await evaluateAutoReplyIntent({ userId, message });

  if (!intent?.matched) {
    // No serious intent → no lead, no reply
    return { lead: null, autoReplied: false };
  }

  // 5️⃣ Create or update lead in DB
  const lead = await resolveLeadFromIntent({
    userId,
    phone,
    message,
    intent,
  });

  // // 6️⃣ Send auto-reply if template exists
  // if (intent.replyContent) {
  //   await sendMessage(phone, intent.replyContent);
  // }

  return { lead, autoReplied: true };
}