// src/services/autoReplyHandler.js
import { AutoReply } from "../models/autoReply.js";
import { Lead } from "../models/Lead.js";
import Settings from "../models/Setting.js";
import { sendMessage } from "./whatsapp.send.js";
import { logger } from "../utils/logger.js";

// Cooldown map: phone -> last reply timestamp
const recentReplies = new Map();

/**
 * Determines if auto-reply should fire
 */
async function shouldAutoReply({ userId, message, msgfrom }) {
  const settings = await Settings.findOne({ userId });
  if (!settings || !settings.auto_reply_enabled) return false;

  // Business hours
  if (settings.business_hours_enabled) {
    const now = new Date();
    const [sh, sm] = settings.business_hours_start.split(":").map(Number);
    const [eh, em] = settings.business_hours_end.split(":").map(Number);

    const start = new Date();
    start.setHours(sh, sm, 0, 0);

    const end = new Date();
    end.setHours(eh, em, 0, 0);

    if (now < start || now > end) return false;
  }

  // Ignore group messages if toggle is off
  if (msgfrom?.includes("@g.us") && !settings.allowGroupAutoReply) return false;

  return true;
}

/**
 * Keyword matcher
 */
const matchKeyword = (text, keyword, type = "contains") => {
  if (!text || !keyword) return false;

  text = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  keyword = keyword.toLowerCase().trim();

  if (type === "exact") return text === keyword;
  if (type === "startsWith") return text.startsWith(keyword);
  if (type === "word") return new RegExp(`\\b${keyword}\\b`, "i").test(text);

  return text.includes(keyword);
};

/**
 * Replace placeholders like {name} with actual contact info
 */
const resolveTemplate = (content, contact) => {
  if (!content) return "";
  return content.replace(/\{(\w+)\}/g, (_, key) => contact[key] || "");
};

/**
 * Main auto-reply handler
 */
export async function autoReplyHandler({ userId, msg }) {
  try {
    if (!msg || msg.fromMe || !msg.body) return;

    const text = msg.body.trim();
    const phoneNumber = msg.from?.split("@")[0];
    const name = msg._data?.notifyName || msg._data?.sender?.pushname || "";
    if (!phoneNumber) return;

    // Should we reply?
    const canReply = await shouldAutoReply({ userId, message: text, msgfrom: msg.from });
    if (!canReply) {
      logger.debug(`[WA:${userId}] Auto-reply disabled for this message`);
      return;
    }

    // Cooldown (30s per sender)
    const lastReply = recentReplies.get(phoneNumber);
    if (lastReply && Date.now() - lastReply < 30_000) return;
    recentReplies.set(phoneNumber, Date.now());

    const contactData = { name, phone: phoneNumber };

    // Fetch active rules for this user only
    const rules = await AutoReply.find({ isActive: true, userId })
      .populate("responseTemplate")
      .sort({ priority: 1 });

    if (!rules.length) {
      logger.info(`[WA:${userId}] No active auto-reply rules for this user.`);
      return;
    }

    for (const rule of rules) {
      if (!rule.responseTemplate?.content) {
        logger.warn(`[WA:${userId}] Rule "${rule.name}" has no template content, skipping.`);
        continue;
      }

      // Check if any keyword matches
      let matchedKeyword = null;
      for (const kw of rule.keywords || []) {
        const baseWord = kw.word?.trim();
        if (!baseWord) continue;

        const matchType = kw.matchType || "contains";
        const synonyms = Array.isArray(kw.synonyms)
          ? kw.synonyms.flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean)
          : [];

        const wordsToCheck = [baseWord, ...synonyms];
        const found = wordsToCheck.find(w => w && matchKeyword(text, w, matchType));
        if (found) {
          matchedKeyword = found;
          break;
        }
      }

      if (!matchedKeyword) continue;

      // Resolve template
      const response = resolveTemplate(rule.responseTemplate.content, contactData);

      if (response) {
        await sendMessage(userId, msg.from, response);
        logger.info(`[WA:${userId}] Auto-reply sent to ${phoneNumber} using rule "${rule.name}" triggered by "${matchedKeyword}"`);
      }

      // Capture leads asynchronously
      (async () => {
        const leadKeywords = ["buy", "price", "order"];
        if (leadKeywords.some(k => matchKeyword(text, k, "word"))) {
          try {
            await Lead.findOneAndUpdate(
              { phoneNumber },
              { phoneNumber, name, lastMessage: text },
              { upsert: true }
            );
            logger.info(`[WA:${userId}] Lead captured for ${phoneNumber}`);
          } catch (e) {
            logger.error(`[WA:${userId}] Lead capture failed: ${e.message}`);
          }
        }
      })();

      break; // Only first matching rule fires
    }
  } catch (err) {
    logger.error(`[WA:${userId}] Auto-reply handler failed: ${err.message}`);
  }
}