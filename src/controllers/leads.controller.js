
import { AutoReply } from "../models/autoReply.js";

export async function evaluateAutoReplyIntent({ userId, message }) {
  const autoReplies = await AutoReply.find({ userId, isActive: true })
    .populate("responseTemplate")
    .sort({ priority: 1 });

  const lowerMessage = message.toLowerCase();

  for (const reply of autoReplies) {
    for (const kw of reply.keywords) {
      const terms = [kw.word, ...(kw.synonyms || [])];

      for (const term of terms) {
        if (matchMessage(term, lowerMessage, kw.matchType)) {
          return {
            matched: true,
            autoReplyId: reply._id,
            templateId: reply.responseTemplate?._id || null,
            replyContent: reply.responseTemplate?.content || "",
            triggerKeyword: kw.word,
            matchedSynonym: term !== kw.word ? term : null,
            hotPoints: kw.points || 0,
          };
        }
      }
    }
  }

  return { matched: false };
}

function matchMessage(keyword, message, matchType) {
  keyword = keyword.toLowerCase();

  switch (matchType) {
    case "contains":
      return message.includes(keyword);
    case "exact":
      return message === keyword;
    case "startsWith":
      return message.startsWith(keyword);
    case "word":
      return message.split(/\s+/).includes(keyword);
    default:
      return false;
  }
}
