
import pkg from "whatsapp-web.js";
import fs from "fs/promises";
import path from "path";

import WhatsAppSession from "../models/WhatsAppSession.js";
import { logger } from "../utils/logger.js";
import { handleIncomingMessage } from "../utils/message.dispatcher.js";
import { supabaseWhatsAppStore } from "./whatsappAuthStore.js";

const {
  Client,
  LocalAuth,
  RemoteAuth,
} = pkg;

const clients = new Map();
const initializingClients = new Map();
const readyClients = new Set();

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

const AUTH_PATH =
  process.env.WHATSAPP_AUTH_PATH || "./wwebjs_auth";

const BACKUP_INTERVAL =
  Math.max(
    60_000,
    Number(
      process.env.WHATSAPP_BACKUP_INTERVAL_MS ||
        60_000
    )
  );


/*
 * ---------------------------------------------------------
 * Persistent RemoteAuth
 * ---------------------------------------------------------
 *
 * whatsapp-web.js RemoteAuth normally deletes the remote
 * session during disconnect().
 *
 * We do NOT want that.
 *
 * A network disconnect must not destroy our production
 * recovery copy.
 *
 * Only explicit logout() deletes the Supabase session.
 */
class PersistentRemoteAuth extends RemoteAuth {
  async disconnect() {
    clearInterval(this.backupSync);

    if (this.userDataDir) {
      try {
        await fs.rm(this.userDataDir, {
          recursive: true,
          force: true,
          maxRetries: this.rmMaxRetries || 4,
        });
      } catch (error) {
        logger.warn(
          `[WA AUTH] Failed to remove temporary auth directory: ${error.message}`
        );
      }
    }
  }

  async logout() {
    clearInterval(this.backupSync);

    try {
      await this.deleteRemoteSession();
    } catch (error) {
      logger.error(
        `[WA AUTH] Failed to delete remote session: ${error.message}`
      );
    }

    if (this.userDataDir) {
      try {
        await fs.rm(this.userDataDir, {
          recursive: true,
          force: true,
          maxRetries: this.rmMaxRetries || 4,
        });
      } catch (error) {
        logger.warn(
          `[WA AUTH] Failed to remove local auth directory: ${error.message}`
        );
      }
    }
  }
}


/*
 * ---------------------------------------------------------
 * Public state helpers
 * ---------------------------------------------------------
 */

export function getClient(userId) {
  const key = String(userId);

  if (!clients.has(key)) {
    return null;
  }

  if (!readyClients.has(key)) {
    return null;
  }

  return clients.get(key);
}


export function isWhatsAppReady(userId) {
  const key = String(userId);

  return (
    clients.has(key) &&
    readyClients.has(key)
  );
}


export function getWhatsAppState(userId) {
  const key = String(userId);
  const client = clients.get(key);

  return {
    exists: Boolean(client),
    ready: readyClients.has(key),
  };
}


/*
 * ---------------------------------------------------------
 * Client initialization
 * ---------------------------------------------------------
 */

export async function initWhatsAppUser(userId) {
  const key = String(userId);

  if (clients.has(key)) {
    const client = clients.get(key);

    logger.info(
      `[WA:${userId}] Client already exists`
    );

    return client;
  }

  if (initializingClients.has(key)) {
    logger.info(
      `[WA:${userId}] Initialization already in progress`
    );

    return initializingClients.get(key);
  }

  const promise =
    initializeClient(userId);

  initializingClients.set(
    key,
    promise
  );

  try {
    return await promise;
  } finally {
    initializingClients.delete(key);
  }
}


/*
 * ---------------------------------------------------------
 * Create auth strategy
 * ---------------------------------------------------------
 */

function createAuthStrategy(userId) {
  const key = String(userId);

  if (!IS_PRODUCTION) {
    logger.info(
      `[WA:${userId}] Using LocalAuth`
    );

    return new LocalAuth({
      clientId: key,
      dataPath: AUTH_PATH,
      rmMaxRetries: 4,
    });
  }

  logger.info(
    `[WA:${userId}] Using Supabase RemoteAuth`
  );

  return new PersistentRemoteAuth({
    clientId: key,
    dataPath: AUTH_PATH,

    store: supabaseWhatsAppStore,

    backupSyncIntervalMs:
      BACKUP_INTERVAL,

    rmMaxRetries: 4,
  });
}


/*
 * ---------------------------------------------------------
 * Create client
 * ---------------------------------------------------------
 */

function createClient(userId) {
  return new Client({
    authStrategy:
      createAuthStrategy(userId),

    puppeteer: {
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--no-first-run",
        "--no-zygote",
        "--disable-default-apps",
        "--disable-notifications",
        "--window-size=1920,1080",
      ],

      defaultViewport: null,

      timeout: 60_000,
    },

    takeoverOnConflict: true,
    takeoverTimeoutMs: 10_000,

    qrMaxRetries: 0,
  });
}


/*
 * ---------------------------------------------------------
 * Mongo state helpers
 * ---------------------------------------------------------
 */

async function updateSession(userId, updates) {
  try {
    await WhatsAppSession.updateOne(
      { userId },
      {
        $set: updates,
      },
      {
        upsert: true,
      }
    );
  } catch (error) {
    logger.error(
      `[WA:${userId}] Failed to update Mongo state: ${error.message}`
    );
  }
}


/*
 * ---------------------------------------------------------
 * Initialize one client
 * ---------------------------------------------------------
 */

async function initializeClient(userId) {
  const key = String(userId);

  const client =
    createClient(userId);

  /*
   * Register immediately so concurrent calls cannot
   * create another client.
   */
  clients.set(key, client);


  /*
   * -------------------------------------------------------
   * QR
   * -------------------------------------------------------
   */

  client.on("qr", async (qr) => {
    readyClients.delete(key);

    logger.info(
      `[WA:${userId}] QR generated`
    );

    await updateSession(userId, {
      connected: false,
      requiresQR: true,
      hasSession: false,
      state: "QR",
      qr,
    });
  });


  /*
   * -------------------------------------------------------
   * Authentication
   * -------------------------------------------------------
   */

  client.on("authenticated", async () => {
    logger.info(
      `[WA:${userId}] WhatsApp authenticated`
    );

    await updateSession(userId, {
      connected: false,
      requiresQR: false,
      hasSession: true,
      state: "AUTHENTICATED",
      qr: null,
      lastAuthenticatedAt: new Date(),
    });
  });


  /*
   * -------------------------------------------------------
   * Ready
   * -------------------------------------------------------
   */

  client.on("ready", async () => {
    readyClients.add(key);

    logger.info(
      `[WA:${userId}] WhatsApp ready`
    );

    await updateSession(userId, {
      connected: true,
      requiresQR: false,
      hasSession: true,
      state: "READY",
      qr: null,
      lastReadyAt: new Date(),
    });
  });


  /*
   * -------------------------------------------------------
   * State changes
   * -------------------------------------------------------
   */

  client.on(
    "change_state",
    async (state) => {
      logger.info(
        `[WA:${userId}] State changed: ${state}`
      );

      await updateSession(userId, {
        state,
      });
    }
  );


  /*
   * -------------------------------------------------------
   * Loading
   * -------------------------------------------------------
   */

  client.on(
    "loading_screen",
    (percent, message) => {
      logger.debug(
        `[WA:${userId}] Loading ${percent}% - ${message}`
      );
    }
  );


  /*
   * -------------------------------------------------------
   * Authentication failure
   * -------------------------------------------------------
   */

  client.on(
    "auth_failure",
    async (message) => {
      readyClients.delete(key);

      logger.error(
        `[WA:${userId}] Authentication failure: ${message}`
      );

      await updateSession(userId, {
        connected: false,
        requiresQR: true,
        state: "AUTH_FAILURE",
        qr: null,
      });
    }
  );


  /*
   * -------------------------------------------------------
   * Runtime error
   * -------------------------------------------------------
   */

  client.on("error", async (error) => {
    logger.error(
      `[WA:${userId}] Client error: ${error?.message || error}`
    );

    await updateSession(userId, {
      state: "ERROR",
      lastError:
        error?.message || String(error),
    });
  });


  /*
   * -------------------------------------------------------
   * Remote session saved
   * -------------------------------------------------------
   */

  client.on(
    "remote_session_saved",
    async () => {
      logger.info(
        `[WA:${userId}] Remote WhatsApp session saved`
      );

      await updateSession(userId, {
        hasSession: true,
        lastSessionBackupAt: new Date(),
      });
    }
  );


  /*
   * -------------------------------------------------------
   * Disconnect
   * -------------------------------------------------------
   */

  client.on(
    "disconnected",
    async (reason) => {
      readyClients.delete(key);

      clients.delete(key);

      const normalizedReason =
        String(reason || "").toUpperCase();

      const wasLogout =
        normalizedReason === "LOGOUT";

      logger.warn(
        `[WA:${userId}] Disconnected: ${reason}`
      );

      await updateSession(userId, {
        connected: false,
        requiresQR: wasLogout,
        state: wasLogout
          ? "LOGGED_OUT"
          : "DISCONNECTED",
        qr: null,
        hasSession: !wasLogout,
      });
    }
  );


  /*
   * -------------------------------------------------------
   * Incoming messages
   * -------------------------------------------------------
   */

  client.on(
    "message",
    async (msg) => {
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
    }
  );


  /*
   * -------------------------------------------------------
   * Initialize
   * -------------------------------------------------------
   */

  try {
    logger.info(
      `[WA:${userId}] Initializing WhatsApp client`
    );

    await client.initialize();

    logger.info(
      `[WA:${userId}] Client initialization completed`
    );

    return client;
  } catch (error) {
    clients.delete(key);
    readyClients.delete(key);

    await updateSession(userId, {
      connected: false,
      state: "INITIALIZATION_ERROR",
      lastError: error.message,
    });

    logger.error(
      `[WA:${userId}] Client initialization failed: ${error.message}`
    );

    try {
      await client.destroy();
    } catch {}

    throw error;
  }
}


/*
 * ---------------------------------------------------------
 * Wait for ready
 * ---------------------------------------------------------
 */

export async function waitForClientReady(
  userId,
  timeout = 15_000
) {
  const key = String(userId);

  if (readyClients.has(key)) {
    return true;
  }

  /*
   * If there isn't even a client, don't sit around for
   * 60 seconds pretending something is happening.
   */
  if (!clients.has(key)) {
    throw new Error(
      `WhatsApp client is not initialized for user ${userId}`
    );
  }

  const started = Date.now();

  while (
    Date.now() - started <
    timeout
  ) {
    if (readyClients.has(key)) {
      return true;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 500)
    );
  }

  throw new Error(
    `WhatsApp client did not become ready for user ${userId}`
  );
}


/*
 * ---------------------------------------------------------
 * Explicit logout / destroy
 * ---------------------------------------------------------
 */

export async function destroyClient(
  userId,
  logout = false
) {
  const key = String(userId);
  const client = clients.get(key);

  if (!client) {
    /*
     * Even if the in-memory client disappeared after a
     * crash, explicit logout should clear the persisted
     * application state.
     */
    if (logout) {
      await updateSession(userId, {
        connected: false,
        requiresQR: true,
        hasSession: false,
        state: "LOGGED_OUT",
        qr: null,
      });
    }

    return;
  }

  try {
    if (logout) {
      logger.info(
        `[WA:${userId}] Explicit WhatsApp logout`
      );

      await client.logout();
    } else {
      await client.destroy();
    }
  } catch (error) {
    logger.error(
      `[WA:${userId}] Destroy error: ${error.message}`
    );
  } finally {
    clients.delete(key);
    readyClients.delete(key);
    initializingClients.delete(key);
  }

  if (logout) {
    await updateSession(userId, {
      connected: false,
      requiresQR: true,
      hasSession: false,
      state: "LOGGED_OUT",
      qr: null,
    });
  }
}


/*
 * ---------------------------------------------------------
 * Restore all known WhatsApp accounts
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Do NOT query connected:true.
 *
 * connected is runtime state and becomes false during
 * shutdowns/restarts.
 *
 * hasSession means the user has previously linked WhatsApp.
 */
export async function initAllWhatsAppUsers() {
  const sessions =
    await WhatsAppSession.find({
      hasSession: true,
    }).select("userId");

  logger.info(
    `[WA] Restoring ${sessions.length} WhatsApp sessions`
  );

  /*
   * Initialize sequentially to avoid launching many
   * Chromium processes simultaneously.
   */
  for (const session of sessions) {
    try {
      await initWhatsAppUser(
        session.userId
      );

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