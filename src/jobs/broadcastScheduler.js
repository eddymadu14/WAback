
import Broadcast from "../models/Broadcast.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import { isWhatsAppReady } from "../services/whatsapp.manager.js";
import { logger } from "../utils/logger.js";


let schedulerRunning = false;

const INTERVAL_MS =
  Number(
    process.env.BROADCAST_INTERVAL_MS ||
      30_000
  );


async function processScheduledBroadcasts() {
  if (schedulerRunning) {
    logger.debug(
      "[BROADCAST] Previous scheduler cycle still running"
    );

    return;
  }

  schedulerRunning = true;

  try {
    const now = new Date();

    const dueBroadcasts =
      await Broadcast.find({
        isScheduled: true,
        status: "pending",
        scheduledFor: {
          $lte: now,
        },
      }).sort({
        scheduledFor: 1,
      });


    if (!dueBroadcasts.length) {
      return;
    }


    logger.info(
      `[BROADCAST] Found ${dueBroadcasts.length} due broadcast(s)`
    );


    for (
      const broadcast of dueBroadcasts
    ) {
      const userId =
        String(broadcast.userId);


      /*
       * Do not consume a scheduled broadcast when
       * WhatsApp isn't actually ready.
       *
       * It remains pending for the next cycle.
       */
      if (
        !isWhatsAppReady(userId)
      ) {
        logger.warn(
          `[BROADCAST:${broadcast._id}] WhatsApp not ready for user ${userId}; keeping broadcast pending`
        );

        continue;
      }


      try {
        await broadcastMessage(
          broadcast._id
        );

        logger.info(
          `[BROADCAST:${broadcast._id}] Scheduled broadcast processed`
        );
      } catch (error) {
        logger.error(
          `[BROADCAST:${broadcast._id}] Processing failed: ${error.message}`
        );

        /*
         * Do NOT mark the broadcast as completed.
         *
         * If WhatsApp temporarily reconnects, the next
         * scheduler cycle can retry it.
         */
      }
    }
  } catch (error) {
    logger.error(
      `[BROADCAST] Scheduler cycle failed: ${error.message}`
    );
  } finally {
    schedulerRunning = false;
  }
}


export function startBroadcastScheduler() {
  logger.info(
    `[BROADCAST] Scheduler started (${INTERVAL_MS}ms interval)`
  );

  /*
   * Run immediately instead of waiting one full interval.
   */
  processScheduledBroadcasts();


  const timer = setInterval(
    processScheduledBroadcasts,
    INTERVAL_MS
  );


  /*
   * Don't prevent Node from shutting down cleanly.
   */
  timer.unref?.();


  return () => {
    clearInterval(timer);

    logger.info(
      "[BROADCAST] Scheduler stopped"
    );
  };
}
