
/*
 * WhatsApp authentication is NOT stored in MongoDB.
 *
 * Development:
 *   LocalAuth -> ./wwebjs_auth
 *
 * Production:
 *   RemoteAuth -> Supabase Storage
 *
 * This file is intentionally kept as a compatibility
 * module for older imports.
 */

const sessionStore = {
  async get() {
    return null;
  },

  async set() {
    return;
  },

  async remove() {
    return;
  },
};
