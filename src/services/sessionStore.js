// sessionStore.js
import WhatsAppSession from "../models/WhatsAppSession.js";
import { logger } from "../utils/logger.js";

const sessionStore = {
  /**
   * Get WhatsApp session for a given user
   * @param {string} userId
   * @returns {object|null} session object or null if not found
   */
  async get(userId) {
    try {
      const ws = await WhatsAppSession.findOne({ userId });
      if (!ws || !ws.session) {
        logger.info(`[SESSION STORE][GET] No session found for user ${userId}`);
        return null;
      }

      // Return the raw session object stored by WhatsApp Manager
      return ws.session;
    } catch (err) {
      logger.error(`[SESSION STORE][GET] Error fetching session for ${userId}: ${err.message}`);
      return null;
    }
  },

  /**
   * Save or update WhatsApp session for a user
   * @param {string} userId
   * @param {object} sessionData
   */
  async set(userId, sessionData) {
    try {
      if (!sessionData || typeof sessionData !== "object") {
        logger.warn(`[SESSION STORE][SET] Invalid sessionData for user ${userId}`);
        return;
      }

      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            session: sessionData, // 🔑 Save the exact WhatsApp session payload
            connected: true,
            requiresQR: false,
            qr: null,
          },
        },
        { upsert: true }
      );

      logger.info(`[SESSION STORE][SET] Session saved for user ${userId}`);
    } catch (err) {
      logger.error(`[SESSION STORE][SET] Failed to save session for user ${userId}: ${err.message}`);
    }
  },

  /**
   * Delete a user's WhatsApp session
   * @param {string} userId
   */
  async remove(userId) {
    try {
      await WhatsAppSession.deleteOne({ userId });
      logger.info(`[SESSION STORE][REMOVE] Session removed for user ${userId}`);
    } catch (err) {
      logger.error(`[SESSION STORE][REMOVE] Failed to remove session for ${userId}: ${err.message}`);
    }
  },
};

export default sessionStore;