
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";

import app from "./app.js";
import connectDB from "./config/db.js";
import {
  initAllWhatsAppUsers,
} from "./services/whatsapp.manager.js";
import {
  startBroadcastScheduler,
} from "./jobs/broadcastScheduler.js";
import { logger } from "./utils/logger.js";


process.on(
  "uncaughtException",
  (error) => {
    logger.error(
      `Uncaught Exception: ${error.message}`
    );

    console.error(error.stack);

    process.exit(1);
  }
);


process.on(
  "unhandledRejection",
  (reason) => {
    logger.error(
      `Unhandled Rejection: ${reason}`
    );
  }
);


async function startServer() {
  try {
    /*
     * 1. Database
     */
    await connectDB();

    logger.info(
      "MongoDB connected successfully"
    );


    /*
     * 2. Middleware
     */
    app.use(cors());


    /*
     * 3. HTTP server
     */
    const PORT =
      process.env.PORT || 5000;

    app.listen(
      PORT,
      () => {
        logger.info(
          `Backend running on port ${PORT}`
        );

        console.log(
          `Backend running on port ${PORT}`
        );
      }
    );


    /*
     * 4. Restore WhatsApp sessions.
     *
     * Local:
     *   LocalAuth restores from disk.
     *
     * Production:
     *   RemoteAuth downloads from Supabase.
     */
    await initAllWhatsAppUsers();

    logger.info(
      "WhatsApp session restoration completed"
    );


    /*
     * 5. Start scheduler AFTER restoration
     * has been initiated.
     */
    startBroadcastScheduler();

    logger.info(
      "Broadcast scheduler started"
    );
  } catch (error) {
    logger.error(
      `Server startup failed: ${error.message}`
    );

    console.error(error);

    process.exit(1);
  }
}


startServer();
