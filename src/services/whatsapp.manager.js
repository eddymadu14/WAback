
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

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

const AUTH_PATH =
  process.env.WHATSAPP_AUTH_PATH || "./wwebjs_auth";

const BACKUP_INTERVAL_MS = Math.max(
  60_000,
  Number(
    process.env.WHATSAPP_BACKUP_INTERVAL_MS ||
      300_000
  )
);

/*
|--------------------------------------------------------------------------
| Runtime state
|--------------------------------------------------------------------------
|
| These Maps/Sets are deliberately NOT persisted.
|
| Authentication persistence:
|
| Development -> LocalAuth filesystem
| Production  -> RemoteAuth + Supabase
|
| Runtime readiness:
|
| readyClients
|
| MongoDB is NOT used to restore WhatsApp authentication.
|
*/

const clients = new Map();
const initializingClients = new Map();
const readyClients = new Set();

/*
|--------------------------------------------------------------------------
| Persistent RemoteAuth
|--------------------------------------------------------------------------
|
| RemoteAuth's normal disconnect behavior can remove the
| remote session. We do NOT want a temporary WhatsApp/network
| disconnect to destroy the production authentication backup.
|
| Only explicit logout removes the persisted session.
|
*/

class PersistentRemoteAuth extends RemoteAuth {
  async disconnect() {
    clearInterval(this.backupSync);

    if (this.userDataDir) {
      try {
        await fs.rm(this.userDataDir, {
          recursive: true,
          force: true,
          maxRetries: 4,
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
          maxRetries: 4,
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
|--------------------------------------------------------------------------
| Runtime helpers
|--------------------------------------------------------------------------
*/

export function isWhatsAppReady(userId) {
  const key = String(userId);

  const client = clients.get(key);

  return Boolean(
    client &&
      readyClients.has(key)
  );
}

export function getClient(userId) {
  const key = String(userId);

  if (!isWhatsAppReady(key)) {
    return null;
  }

  return clients.get(key);
}

export function getWhatsAppState(userId) {
  const key = String(userId);

  const client = clients.get(key);

  return {
    initialized: Boolean(client),
    ready: readyClients.has(key),
  };
}

/*
|--------------------------------------------------------------------------
| MongoDB status cache
|--------------------------------------------------------------------------
|
| MongoDB can store UI/application status.
|
| It is NEVER used to restore authentication.
|
*/

async function updateSessionStatus(userId, updates) {
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
      `[WA:${userId}] Failed to update status: ${error.message}`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Authentication strategy
|--------------------------------------------------------------------------
*/

function createAuthStrategy(userId) {
  const clientId = String(userId);

  if (!IS_PRODUCTION) {
    logger.info(
      `[WA:${userId}] Authentication: LocalAuth`
    );

    return new LocalAuth({
      clientId,
      dataPath: AUTH_PATH,
      rmMaxRetries: 4,
    });
  }

  logger.info(
    `[WA:${userId}] Authentication: Supabase RemoteAuth`
  );

  return new PersistentRemoteAuth({
    clientId,
    dataPath: AUTH_PATH,
    store: supabaseWhatsAppStore,
    backupSyncIntervalMs:
      BACKUP_INTERVAL_MS,
    rmMaxRetries: 4,
  });
}

/*
|--------------------------------------------------------------------------
| Client creation
|--------------------------------------------------------------------------
*/

function createWhatsAppClient(userId) {
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
|--------------------------------------------------------------------------
| Initialize one user
|--------------------------------------------------------------------------
*/

export async function initWhatsAppUser(userId) {
  const key = String(userId);

  if (clients.has(key)) {
    return clients.get(key);
  }

  if (initializingClients.has(key)) {
    return initializingClients.get(key);
  }

  const promise =
    initializeWhatsAppClient(userId);

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
|--------------------------------------------------------------------------
| Actual initialization
|--------------------------------------------------------------------------
*/

async function initializeWhatsAppClient(userId) {
  const key = String(userId);

  const client =
    createWhatsAppClient(userId);

  /*
   * Register immediately.
   */
  clients.set(key, client);

  /*
   * QR
   */
  client.on("qr", async (qr) => {
    readyClients.delete(key);

    logger.info(
      `[WA:${userId}] QR generated`
    );

    await updateSessionStatus(
      userId,
      {
        connected: false,
        requiresQR: true,
        hasSession: false,
        state: "QR",
        qr,
      }
    );
  });

  /*
   * Authentication successful.
   */
  client.on(
    "authenticated",
    async () => {
      logger.info(
        `[WA:${userId}] WhatsApp authenticated`
      );

      await updateSessionStatus(
        userId,
        {
          connected: false,
          requiresQR: false,
          hasSession: true,
          state: "AUTHENTICATED",
          qr: null,
          lastAuthenticatedAt:
            new Date(),
        }
      );
    }
  );

  /*
   * THIS is the authoritative runtime
   * connection event.
   */
  client.on("ready", async () => {
    readyClients.add(key);

    logger.info(
      `[WA:${userId}] WhatsApp READY`
    );

    await updateSessionStatus(
      userId,
      {
        connected: true,
        requiresQR: false,
        hasSession: true,
        state: "READY",
        qr: null,
        lastReadyAt: new Date(),
      }
    );
  });

  /*
   * WhatsApp state changes.
   */
  client.on(
    "change_state",
    async (state) => {
      logger.info(
        `[WA:${userId}] State: ${state}`
      );

      await updateSessionStatus(
        userId,
        {
          state: String(state),
        }
      );
    }
  );

  /*
   * Loading.
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
   * Authentication failure.
   */
  client.on(
    "auth_failure",
    async (message) => {
      readyClients.delete(key);

      logger.error(
        `[WA:${userId}] Authentication failure: ${message}`
      );

      await updateSessionStatus(
        userId,
        {
          connected: false,
          requiresQR: true,
          state: "AUTH_FAILURE",
          qr: null,
        }
      );
    }
  );

  /*
   * Client error.
   */
  client.on("error", async (error) => {
    logger.error(
      `[WA:${userId}] Client error: ${
        error?.message || error
      }`
    );

    await updateSessionStatus(
      userId,
      {
        state: "ERROR",
        lastError:
          error?.message ||
          String(error),
      }
    );
  });

  /*
   * Production RemoteAuth backup.
   */
  client.on(
    "remote_session_saved",
    async () => {
      logger.info(
        `[WA:${userId}] Remote session saved`
      );

      await updateSessionStatus(
        userId,
        {
          hasSession: true,
          lastSessionBackupAt:
            new Date(),
        }
      );
    }
  );

  /*
   * Disconnect.
   */
  client.on(
    "disconnected",
    async (reason) => {
      readyClients.delete(key);

      clients.delete(key);

      const normalizedReason =
        String(reason || "")
          .toUpperCase();

      const loggedOut =
        normalizedReason === "LOGOUT";

      logger.warn(
        `[WA:${userId}] Disconnected: ${reason}`
      );

      await updateSessionStatus(
        userId,
        {
          connected: false,
          requiresQR: loggedOut,
          hasSession: !loggedOut,
          state: loggedOut
            ? "LOGGED_OUT"
            : "DISCONNECTED",
          qr: null,
        }
      );
    }
  );

  /*
   * Incoming messages.
   *
   * Auto responder, lead detection and
   * message dispatcher remain untouched.
   */
  client.on(
    "message",
    async (msg) => {
      try {
        if (!msg?.body) {
          return;
        }

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
   * Initialize.
   */
  try {
    logger.info(
      `[WA:${userId}] Initializing WhatsApp`
    );

    await client.initialize();

    logger.info(
      `[WA:${userId}] Initialization completed`
    );

    return client;
  } catch (error) {
    clients.delete(key);
    readyClients.delete(key);

    await updateSessionStatus(
      userId,
      {
        connected: false,
        state: "INITIALIZATION_ERROR",
        lastError: error.message,
      }
    );

    logger.error(
      `[WA:${userId}] Initialization failed: ${error.message}`
    );

    try {
      await client.destroy();
    } catch {}

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Wait until actual READY
|--------------------------------------------------------------------------
*/

export async function waitForClientReady(
  userId,
  timeout = 30_000
) {
  const key = String(userId);

  if (readyClients.has(key)) {
    return true;
  }

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

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 500)
    );
  }

  throw new Error(
    `WhatsApp client did not become ready for user ${userId}`
  );
}

/*
|--------------------------------------------------------------------------
| Explicit logout
|--------------------------------------------------------------------------
*/

export async function destroyClient(
  userId,
  logout = false
) {
  const key = String(userId);

  const client = clients.get(key);

  readyClients.delete(key);
  clients.delete(key);
  initializingClients.delete(key);

  if (!client) {
    if (logout) {
      await updateSessionStatus(
        userId,
        {
          connected: false,
          requiresQR: true,
          hasSession: false,
          state: "LOGGED_OUT",
          qr: null,
        }
      );
    }

    return;
  }

  try {
    if (logout) {
      logger.info(
        `[WA:${userId}] Explicit logout`
      );

      await client.logout();
    } else {
      await client.destroy();
    }
  } catch (error) {
    logger.error(
      `[WA:${userId}] Destroy error: ${error.message}`
    );
  }

  if (logout) {
    await updateSessionStatus(
      userId,
      {
        connected: false,
        requiresQR: true,
        hasSession: false,
        state: "LOGGED_OUT",
        qr: null,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Discover persisted sessions
|--------------------------------------------------------------------------
|
| DEVELOPMENT:
|   Read ./wwebjs_auth/session-<userId>
|
| PRODUCTION:
|   Ask Supabase store for persisted sessions.
|
| MongoDB is NOT queried.
|--------------------------------------------------------------------------
*/

async function getPersistedUserIds() {
  if (!IS_PRODUCTION) {
    try {
      const entries =
        await fs.readdir(
          path.resolve(AUTH_PATH),
          {
            withFileTypes: true,
          }
        );

      return entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.startsWith(
              "session-"
            )
        )
        .map(
          (entry) =>
            entry.name.replace(
              /^session-/,
              ""
            )
        )
        .filter(Boolean);
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  return supabaseWhatsAppStore.listSessions();
}

/*
|--------------------------------------------------------------------------
| Restore all persisted WhatsApp sessions
|--------------------------------------------------------------------------
*/

export async function initAllWhatsAppUsers() {
  const userIds =
    await getPersistedUserIds();

  logger.info(
    `[WA] Found ${userIds.length} persisted WhatsApp session(s)`
  );

  for (const userId of userIds) {
    try {
      /*
       * Start restoration.
       *
       * We deliberately do not require MongoDB
       * to say "connected".
       */
      await initWhatsAppUser(userId);

      logger.info(
        `[WA:${userId}] Restoration initiated`
      );
    } catch (error) {
      logger.error(
        `[WA:${userId}] Restoration failed: ${error.message}`
      );
    }
  }
}