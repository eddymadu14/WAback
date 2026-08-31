
import Broadcast from "../models/Broadcast.js";

import {
  broadcastMessage,
} from "../services/broadcast.service.js";

import {
  isWhatsAppReady,
} from "../services/whatsapp.manager.js";

import { logger } from "../utils/logger.js";

let running = false;

const INTERVAL_MS =
  Math.max(
    5_000,
    Number(
      process.env.BROADCAST_INTERVAL_MS ||
        30_000
    )
  );

async function processScheduledBroadcasts() {
  if (running) {
    return;
  }

  running = true;

  try {
    const now = new Date();

    const broadcasts =
      await Broadcast.find({
        isScheduled: true,
        status: "pending",
        scheduledFor: {
          $lte: now,
        },
      }).sort({
        scheduledFor: 1,
      });

    for (const broadcast of broadcasts) {
      const userId =
        String(broadcast.userId);

      /*
       * WhatsApp isn't ready.
       *
       * DO NOTHING.
       *
       * The broadcast stays pending.
       */
      if (
        !isWhatsAppReady(userId)
      ) {
        logger.debug(
          `[BROADCAST:${broadcast._id}] Waiting for WhatsApp user ${userId}`
        );

        continue;
      }

      try {
        await broadcastMessage(
          broadcast._id
        );
      } catch (error) {
        /*
         * Never consume the broadcast because of
         * a temporary WhatsApp problem.
         */
        logger.error(
          `[BROADCAST:${broadcast._id}] Attempt failed: ${error.message}`
        );
      }
    }
  } catch (error) {
    logger.error(
      `[BROADCAST] Scheduler failed: ${error.message}`
    );
  } finally {
    running = false;
  }
}

export function startBroadcastScheduler() {
  logger.info(
    `[BROADCAST] Scheduler started (${INTERVAL_MS}ms)`
  );

  /*
   * Run immediately.
   */
  processScheduledBroadcasts();

  const timer =
    setInterval(
      processScheduledBroadcasts,
      INTERVAL_MS
    );

  timer.unref?.();

  return () => {
    clearInterval(timer);

    logger.info(
      "[BROADCAST] Scheduler stopped"
    );
  };
}