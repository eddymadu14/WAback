// server.js
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import connectDB from "./config/db.js";
import cors from "cors";

import { initAllWhatsAppUsers } from "./services/whatsapp.manager.js";
import { startBroadcastScheduler } from "./jobs/broadcastScheduler.js";
import { logger } from "./utils/logger.js";

// ----------------------
// Global error handlers
// ----------------------
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

// ----------------------
// Bootstrap server
// ----------------------
async function startServer() {
  try {
    // 1️⃣ Connect DB first
    await connectDB();
    logger.info("MongoDB connected successfully");

    // 2️⃣ Middleware
    app.use(cors());

    // 3️⃣ Start HTTP server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      logger.info(`Backend running on port ${PORT}`);
      console.log(`Backend running on port ${PORT}`);
    });

    // 4️⃣ Restore WhatsApp clients (CRITICAL)
    await initAllWhatsAppUsers();
    logger.info("All connected WhatsApp clients restored");

    // 5️⃣ Start broadcast scheduler AFTER WhatsApp restore
    startBroadcastScheduler();
    logger.info("Broadcast scheduler started");

  } catch (err) {
    logger.error(`Server startup failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

startServer();