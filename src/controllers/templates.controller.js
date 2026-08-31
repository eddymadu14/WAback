import { Template } from "../models/Template.js";

// ----------------------------------
// Helper: extract placeholders like {firstName}, {orderId}
// ----------------------------------
const extractPlaceholders = (content = "") => {
  const matches = content.match(/{\w+}/g);
  return matches ? matches.map((ph) => ph.replace(/[{}]/g, "")) : [];
};

// ----------------------------------
// CREATE TEMPLATE (user-owned)
// ----------------------------------
export const createTemplate = async (req, res) => {
  try {
    const { name, content, keywords, is_active } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!name || !content) {
      return res.status(400).json({ message: "Name and content are required" });
    }

    const placeholders = extractPlaceholders(content);

    const template = await Template.create({
      userId: req.user._id,
      name,
      content,
      keywords: Array.isArray(keywords) ? keywords : [],
      is_active: is_active ?? true,
      placeholders,
    });

    res.status(201).json(template);
  } catch (error) {
    console.error("CREATE TEMPLATE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// ----------------------------------
// GET ALL TEMPLATES (only user's)
// ----------------------------------
export const getTemplates = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const templates = await Template.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(templates);
  } catch (error) {
    console.error("GET TEMPLATES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// ----------------------------------
// GET SINGLE TEMPLATE (user-owned)
// ----------------------------------
export const getTemplateById = async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    res.json(template);
  } catch (error) {
    console.error("GET TEMPLATE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// ----------------------------------
// UPDATE TEMPLATE (user-owned)
// ----------------------------------
export const updateTemplate = async (req, res) => {
  try {
    const { name, content, keywords, is_active } = req.body;

    const template = await Template.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    if (name !== undefined) template.name = name;
    if (content !== undefined) {
      template.content = content;
      template.placeholders = extractPlaceholders(content);
    }
    if (keywords !== undefined) {
      template.keywords = Array.isArray(keywords) ? keywords : [];
    }
    if (is_active !== undefined) template.is_active = is_active;

    await template.save();
    res.json(template);
  } catch (error) {
    console.error("UPDATE TEMPLATE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// ----------------------------------
// DELETE TEMPLATE (user-owned)
// ----------------------------------
export const deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    res.json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error("DELETE TEMPLATE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};