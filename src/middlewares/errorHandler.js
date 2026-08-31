import { logger } from "../utils/logger.js";

// Express error handling middleware
export const errorHandler = (err, req, res, next) => {
  logger.error(`Error on ${req.method} ${req.url} -> ${err.message}`);
  res.status(500).json({ error: "Internal Server Error" });
};
