import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * ============================
 * 1️⃣ PROTECT ROUTE (AUTH)
 * ============================
 * Ensures user is logged in
 */
export const protect = async (req, res, next) => {
  let token;

  try {
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password -refreshTokens");
      if (!req.user) return res.status(401).json({ message: "User not found" });

      return next();
    }

    return res.status(401).json({ message: "Not authorized, no token" });
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

/**
 * ============================
 * 2️⃣ ADMIN ONLY
 * ============================
 * Ensures user.role === 'admin'
 */
export const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Not authorized" });
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only" });
  next();
};

/**
 * ============================
 * 3️⃣ ALLOW ROLES
 * ============================
 * Ensures user.role is in allowed roles
 * Usage: allowRoles("admin", "moderator")
 */
export const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Access denied: require role [${roles.join(", ")}]` });
    }
    next();
  };
};

/**
 * ============================
 * 4️⃣ PLAN GUARD
 * ============================
 * Checks user.plan matches allowed plans
 * Usage: planGuard("pro", "premium")
 */
export const planGuard = (...plans) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Not authorized" });
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({ message: `Access denied: plan [${plans.join(", ")}] required` });
    }
    next();
  };
};

/**
 * ============================
 * 5️⃣ QUERY HANDLER
 * ============================
 * Handles filtering, pagination, and sorting
 * Usage: queryHandler(User)
 */
export const queryHandler = (Model) => async (req, res, next) => {
  try {
    let query = { ...req.query };

    // Remove fields reserved for pagination
    const removeFields = ["select", "sort", "page", "limit"];
    removeFields.forEach((f) => delete query[f]);

    // Convert query strings like gt, gte, lt, lte
    let queryStr = JSON.stringify(query);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);
    query = JSON.parse(queryStr);

    let dbQuery = Model.find(query);

    // Select fields
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      dbQuery = dbQuery.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      dbQuery = dbQuery.sort(sortBy);
    } else {
      dbQuery = dbQuery.sort({ createdAt: -1 });
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    dbQuery = dbQuery.skip(skip).limit(limit);

    const results = await dbQuery;

    res.filteredResults = results;
    next();
  } catch (err) {
    next(err);
  }
};