// src/services/whatsapp.manager.js

import pkg from "whatsapp-web.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import { logger } from "../utils/logger.js";
import { handleIncomingMessage } from "../utils/message.dispatcher.js";

const { Client, LocalAuth } = pkg;

// Active WhatsApp clients
const clients = new Map(); // userId -> Client

// Clients currently being initialized
const initializingClients = new Map(); // userId -> Promise<Client>

// Clients that have successfully reached "ready"
const readyClients = new Set(); // userId


/**
 * Get a ready WhatsApp client.
 */
export function getClient(userId) {
  const key = String(userId);

  if (!clients.has(key) || !readyClients.has(key)) {
    return null;
  }

  return clients.get(key);
}


/**
 * Store a WhatsApp client.
 */
export function setClient(userId, client) {
  clients.set(String(userId), client);
}


/**
 * Wait until a WhatsApp client becomes ready.
 */
export async function waitForClientReady(userId, timeout = 60000) {
  const key = String(userId);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (readyClients.has(key)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `WhatsApp client for user ${userId} did not become ready within ${timeout}ms`
  );
}


/**
 * Initialize WhatsApp for a user.
 *
 * LocalAuth handles WhatsApp authentication persistence locally.
 *
 * Development:
 *   ./wwebjs_auth
 *
 * Production:
 *   This will later be replaced with our Supabase-backed
 *   persistence implementation.
 */
export async function initWhatsAppUser(userId) {
  const key = String(userId);

  /*
   * If a client already exists, don't initialize another one.
   */
  if (clients.has(key)) {
    logger.info(`[WA:${userId}] Client already initialized`);
    return clients.get(key);
  }

  /*
   * If another request is already initializing this user,
   * return the same promise instead of creating another client.
   */
  if (initializingClients.has(key)) {
    logger.info(
      `[WA:${userId}] Client initialization already in progress`
    );

    return initializingClients.get(key);
  }

  /*
   * Create exactly one initialization promise.
   */
  const initializationPromise = initializeClient(userId);

  initializingClients.set(key, initializationPromise);

  try {
    return await initializationPromise;
  } finally {
    initializingClients.delete(key);
  }
}


/**
 * Create and initialize the WhatsApp client.
 */
async function initializeClient(userId) {
  const key = String(userId);

  logger.info(`[WA:${userId}] Creating WhatsApp client`);

  /*
   * LocalAuth stores the actual WhatsApp Web authentication
   * data on the local filesystem.
   *
   * Each user receives an isolated authentication directory:
   *
   * ./wwebjs_auth/session-wa-<userId>
   */
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: key,
      dataPath: "./wwebjs_auth",
    }),

    puppeteer: {
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--window-size=1920,1080",
      ],

      defaultViewport: null,
    },
  });

  /*
   * Register the client BEFORE initialize().
   *
   * This prevents another request from creating a second
   * client while this one is initializing.
   */
  clients.set(key, client);


  // ============================================================
  // QR
  // ============================================================

  client.on("qr", async (qr) => {
    try {
      readyClients.delete(key);

      logger.info(`[WA:${userId}] QR generated`);

      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            connected: false,
            requiresQR: true,
            qr,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(
        `[WA:${userId}] Failed to save QR: ${error.message}`
      );
    }
  });


  // ============================================================
  // AUTHENTICATED
  // ============================================================

  client.on("authenticated", async () => {
    try {
      logger.info(
        `[WA:${userId}] WhatsApp authenticated`
      );

      /*
       * DO NOT store the authenticated payload.
       *
       * LocalAuth handles the actual WhatsApp session.
       *
       * MongoDB only stores application state.
       */
      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            connected: false,
            requiresQR: false,
            qr: null,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(
        `[WA:${userId}] Failed to update authenticated status: ${error.message}`
      );
    }
  });


  // ============================================================
  // READY
  // ============================================================

  client.on("ready", async () => {
    try {
      readyClients.add(key);

      logger.info(
        `[WA:${userId}] WhatsApp ready`
      );

      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            connected: true,
            requiresQR: false,
            qr: null,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(
        `[WA:${userId}] Failed to update ready status: ${error.message}`
      );
    }
  });


  // ============================================================
  // AUTH FAILURE
  // ============================================================

  client.on("auth_failure", async (message) => {
    try {
      readyClients.delete(key);

      logger.error(
        `[WA:${userId}] Authentication failure: ${message}`
      );

      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            connected: false,
            requiresQR: true,
            qr: null,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error(
        `[WA:${userId}] Failed to update authentication failure: ${error.message}`
      );
    }
  });


  // ============================================================
  // DISCONNECTED
  // ============================================================

  client.on("disconnected", async (reason) => {
    try {
      logger.warn(
        `[WA:${userId}] WhatsApp disconnected: ${reason}`
      );

      readyClients.delete(key);
      clients.delete(key);

      await WhatsAppSession.updateOne(
        { userId },
        {
          $set: {
            connected: false,
            requiresQR: true,
            qr: null,
          },
        },
        { upsert: true }
      );

      /*
       * LocalAuth owns the authentication files.
       *
       * We intentionally do NOT delete them here unless the
       * user explicitly logs out.
       */
    } catch (error) {
      logger.error(
        `[WA:${userId}] Failed to handle disconnect: ${error.message}`
      );
    }
  });


  // ============================================================
  // INCOMING MESSAGE
  // ============================================================

  client.on("message", async (msg) => {
    try {
      if (!msg?.body) {
        return;
      }

      logger.debug(
        `[WA:${userId}] Incoming message from ${msg.from}`
      );

      await handleIncomingMessage({
        userId,
        client,
        msg,
      });
    } catch (error) {
      logger.error(
        `[WA:${userId}] Message handler error: ${error.message}`
      );
    }
  });


  // ============================================================
  // INITIALIZE
  // ============================================================

  try {
    logger.info(
      `[WA:${userId}] Initializing WhatsApp client`
    );

    await client.initialize();

    logger.info(
      `[WA:${userId}] WhatsApp client initialization completed`
    );

    return client;
  } catch (error) {
    /*
     * Initialization failed.
     *
     * Remove the broken client so a later request can retry.
     */
    clients.delete(key);
    readyClients.delete(key);

    logger.error(
      `[WA:${userId}] Client initialization failed: ${error.message}`
    );

    throw error;
  }
}


/**
 * Destroy a WhatsApp client.
 *
 * logout = false:
 *   Destroy browser/client but preserve LocalAuth session.
 *
 * logout = true:
 *   Log out and remove the local WhatsApp authentication data.
 */
export async function destroyClient(userId, logout = false) {
  const key = String(userId);
  const client = clients.get(key);

  if (!client) {
    return;
  }

  try {
    if (logout) {
      logger.info(
        `[WA:${userId}] Logging out WhatsApp`
      );

      await client.logout();
    }

    await client.destroy();

    logger.info(
      `[WA:${userId}] WhatsApp client destroyed`
    );
  } catch (error) {
    logger.error(
      `[WA:${userId}] Destroy error: ${error.message}`
    );
  }

  clients.delete(key);
  readyClients.delete(key);
  initializingClients.delete(key);

  /*
   * LocalAuth normally handles authentication data.
   *
   * When logout is explicitly requested, LocalAuth's session
   * should no longer be considered valid.
   */
  if (logout) {
    await WhatsAppSession.updateOne(
      { userId },
      {
        $set: {
          connected: false,
          requiresQR: true,
          qr: null,
        },
      },
      { upsert: true }
    );
  }
}


/**
 * Restore WhatsApp clients after server startup.
 *
 * Only users marked as connected in MongoDB are attempted.
 *
 * LocalAuth then determines whether their actual authentication
 * session still exists locally.
 */
export async function initAllWhatsAppUsers() {
  const sessions = await WhatsAppSession.find({
    connected: true,
  });

  logger.info(
    `[WA] Restoring ${sessions.length} sessions`
  );

  for (const session of sessions) {
    try {
      await initWhatsAppUser(session.userId);

      logger.info(
        `[WA:${session.userId}] Restore initiated`
      );
    } catch (error) {
      logger.error(
        `[WA:${session.userId}] Restore failed: ${error.message}`
      );
    }
  }
}