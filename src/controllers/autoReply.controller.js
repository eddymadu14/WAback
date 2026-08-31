import { AutoReply } from "../models/autoReply.js";

/**
 * Normalize keywords
 */
const normalizeKeywords = (keywords) => {
  return (keywords || []).map((k) => ({
    word: k.word,
    matchType: k.matchType || "contains",
    synonyms: Array.isArray(k.synonyms)
      ? k.synonyms.map((s) => s.trim()).filter(Boolean)
      : String(k.synonyms || "").split(",").map((s) => s.trim()).filter(Boolean),
  }));
};

/**
 * GET /auto-replies
 */
export const getAutoReplies = async (req, res) => {
  try {
    const rules = await AutoReply.find({ userId: req.user._id }) // ✅ always use _id
      .populate("responseTemplate")
      .sort({ priority: 1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /auto-replies
 * PUT /auto-replies/:id
 */


export const saveAutoReply = async (req, res) => {
 

  try {
    const { name, keywords, template, isActive, priority, cooldownSeconds } = req.body;

    if (!name || !keywords || !template?.id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const payload = {
      userId: req.user._id, // ✅ always _id
      name,
      keywords: normalizeKeywords(keywords),
      responseTemplate: template.id,
      isActive: isActive ?? true,
      priority: priority || 0,
      cooldownSeconds: cooldownSeconds || 30,
    };

    let saved;
    if (req.params.id) {
      saved = await AutoReply.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id }, // ✅ always _id
        payload,
        { new: true }
      ).populate("responseTemplate");
    } else {
      saved = await AutoReply.create(payload);
      saved = await saved.populate("responseTemplate");
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /auto-replies/:id
 */
export const deleteAutoReply = async (req, res) => {
  try {
    await AutoReply.findOneAndDelete({ _id: req.params.id, userId: req.user._id }); // ✅ _id
    res.json({ message: "Auto reply deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH /auto-replies/:id/toggle
 */
export const toggleAutoReply = async (req, res) => {
  try {
    const updated = await AutoReply.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id }, // ✅ _id
      { isActive: req.body.isActive },
      { new: true }
    ).populate("responseTemplate");

    if (!updated) return res.status(404).json({ message: "Auto-reply not found" });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};