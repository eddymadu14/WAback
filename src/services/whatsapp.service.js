import {
  initWhatsAppUser,
  getClient,
} from "./whatsapp.manager.js";

/**
 * Initialize WhatsApp for a user.
 *
 * Session persistence is handled by the WhatsApp manager.
 * Do not pass serialized WhatsApp sessions here.
 */
export async function initWhatsAppForUser(userId) {
  const existingClient = getClient(userId);

  if (existingClient) {
    return existingClient;
  }

  return await initWhatsAppUser(userId);
}