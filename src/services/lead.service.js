
import { Lead } from "../models/Lead.js";

export async function resolveLeadFromIntent({
  userId,
  phone,
  message,
  intent,
}) {
  const now = new Date();

  let lead = await Lead.findOne({ userId, phone });

  if (!lead) {
    // FIRST INTENT → CREATE LEAD
    lead = await Lead.create({
      userId,
      phone,
      message,
      keywordHitCount: 1,
      hotPoints: intent.hotPoints,
      isSerious: false,
      autoReplyId: intent.autoReplyId,
      templateId: intent.templateId,
      triggerKeyword: intent.triggerKeyword,
      matchedSynonym: intent.matchedSynonym,
      lastReplyMessage: intent.replyContent,
      lastInteractionAt: now,
    });
  } else {
    // FOLLOW-UP INTENT → UPDATE LEAD
    lead.message = message;
    lead.keywordHitCount += 1;
    lead.hotPoints += intent.hotPoints;
    lead.autoReplyId = intent.autoReplyId;
    lead.templateId = intent.templateId;
    lead.triggerKeyword = intent.triggerKeyword;
    lead.matchedSynonym = intent.matchedSynonym;
    lead.lastReplyMessage = intent.replyContent;
    lead.lastInteractionAt = now;

    if (lead.keywordHitCount >= 3) {
      lead.isSerious = true;
    }

    await lead.save();
  }

  return lead;
}

