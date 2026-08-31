
Production
NODE_ENV=production

WHATSAPP_AUTH_PATH=./wwebjs_auth

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_WHATSAPP_BUCKET=whatsapp-sessions

WHATSAPP_BACKUP_INTERVAL_MS=60000

BROADCAST_INTERVAL_MS=30000




Yes. I inspected the current WAback repo and I would not keep patching the existing architecture. The current manager already mixes auth persistence, MongoDB status, runtime state, and restoration logic. The broadcast service also permanently converts failed recipients to failed, which prevents later retries. �
GitHub +1
The rewrite should be these files:
whatsapp.manager.js
whatsappAuthStore.js
sessionStore.js — remove it from WhatsApp authentication
WhatsAppSession.js — status cache only
whatsapp.routes.js
whatsapp.send.js
broadcastScheduler.js
broadcast.service.js
server.js
Broadcast.js
The auto-responder/message dispatcher remains intact because the manager will continue passing the same live client into handleIncomingMessage(). �
GitHub
1. whatsapp.manager.js
Replace the entire file:
Writing
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
2. whatsappAuthStore.js
Your current store is close, but it is missing the session discovery method required by the manager. The current version only knows how to check/save/download/delete one session. �
GitHub
Replace it with:
Writing
import fs from "fs/promises";
import path from "path";
import {
  createClient,
} from "@supabase/supabase-js";

import { logger } from "../utils/logger.js";

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

const DATA_PATH =
  process.env.WHATSAPP_AUTH_PATH ||
  "./wwebjs_auth";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET =
  process.env.SUPABASE_WHATSAPP_BUCKET ||
  "whatsapp-sessions";

if (
  IS_PRODUCTION &&
  (!SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY)
) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production"
  );
}

const supabase = IS_PRODUCTION
  ? createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null;

function objectPath(session) {
  return `${session}/${session}.zip`;
}

function localZipPath(session) {
  return path.resolve(
    DATA_PATH,
    `${session}.zip`
  );
}

export const supabaseWhatsAppStore = {
  /*
   * RemoteAuth required method.
   */
  async sessionExists({ session }) {
    if (!IS_PRODUCTION) {
      try {
        await fs.access(
          localZipPath(session)
        );

        return true;
      } catch {
        return false;
      }
    }

    const { data, error } =
      await supabase.storage
        .from(BUCKET)
        .list(session, {
          search: `${session}.zip`,
          limit: 10,
        });

    if (error) {
      throw error;
    }

    return Boolean(
      data?.some(
        (file) =>
          file.name ===
          `${session}.zip`
      )
    );
  },

  /*
   * Discover ALL persisted production sessions.
   */
  async listSessions() {
    if (!IS_PRODUCTION) {
      return [];
    }

    const { data, error } =
      await supabase.storage
        .from(BUCKET)
        .list("", {
          limit: 1000,
        });

    if (error) {
      logger.error(
        `[SUPABASE WA] Failed to list sessions: ${error.message}`
      );

      throw error;
    }

    return (data || [])
      .filter(
        (item) =>
          item.name?.startsWith(
            "session-"
          )
      )
      .map((item) =>
        item.name.replace(
          /^session-/,
          ""
        )
      )
      .filter(Boolean);
  },

  /*
   * Save RemoteAuth ZIP.
   */
  async save({ session }) {
    if (!IS_PRODUCTION) {
      return;
    }

    const localPath =
      localZipPath(session);

    const remotePath =
      objectPath(session);

    const file =
      await fs.readFile(localPath);

    const { error } =
      await supabase.storage
        .from(BUCKET)
        .upload(
          remotePath,
          file,
          {
            contentType:
              "application/zip",
            upsert: true,
            cacheControl: "0",
          }
        );

    if (error) {
      logger.error(
        `[SUPABASE WA] Save failed for ${session}: ${error.message}`
      );

      throw error;
    }

    logger.info(
      `[SUPABASE WA] Session saved: ${session}`
    );
  },

  /*
   * Restore RemoteAuth ZIP.
   */
  async extract({
    session,
    path: destinationPath,
  }) {
    if (!IS_PRODUCTION) {
      return;
    }

    const remotePath =
      objectPath(session);

    const { data, error } =
      await supabase.storage
        .from(BUCKET)
        .download(remotePath);

    if (error) {
      logger.error(
        `[SUPABASE WA] Download failed for ${session}: ${error.message}`
      );

      throw error;
    }

    if (!data) {
      throw new Error(
        `No session data found for ${session}`
      );
    }

    const buffer =
      Buffer.from(
        await data.arrayBuffer()
      );

    await fs.mkdir(
      path.dirname(
        destinationPath
      ),
      {
        recursive: true,
      }
    );

    await fs.writeFile(
      destinationPath,
      buffer
    );

    logger.info(
      `[SUPABASE WA] Session restored: ${session}`
    );
  },

  /*
   * Delete ONLY on explicit logout.
   */
  async delete({ session }) {
    if (!IS_PRODUCTION) {
      return;
    }

    const remotePath =
      objectPath(session);

    const { error } =
      await supabase.storage
        .from(BUCKET)
        .remove([
          remotePath,
        ]);

    if (error) {
      logger.error(
        `[SUPABASE WA] Delete failed for ${session}: ${error.message}`
      );

      throw error;
    }

    logger.info(
      `[SUPABASE WA] Session deleted: ${session}`
    );
  },
};
Important
There is a subtle naming requirement here: the Supabase bucket should contain objects like:
session-695932168a9879344ba3c854/
    session-695932168a9879344ba3c854.zip
because RemoteAuth uses the clientId-derived session name.
3. sessionStore.js
This should no longer participate in WhatsApp authentication.
Your current sessionStore literally reads and writes a session object into MongoDB. �
GitHub
Delete its WhatsApp-session responsibilities.
If other parts of your application still import it, replace the file with:
Writing
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

export default sessionStore;
4. WhatsAppSession.js
MongoDB can still hold UI/runtime status, just not authentication.
Your existing schema is already mostly structured this way. �
GitHub
Keep it, but I would make the intent explicit:
Writing
import mongoose from "mongoose";

const WhatsAppSessionSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true,
      },

      /*
       * Runtime/UI state only.
       *
       * NOT authentication persistence.
       */
      connected: {
        type: Boolean,
        default: false,
      },

      hasSession: {
        type: Boolean,
        default: false,
      },

      requiresQR: {
        type: Boolean,
        default: true,
      },

      qr: {
        type: String,
        default: null,
      },

      state: {
        type: String,
        default: "DISCONNECTED",
      },

      lastError: {
        type: String,
        default: null,
      },

      lastAuthenticatedAt: {
        type: Date,
        default: null,
      },

      lastReadyAt: {
        type: Date,
        default: null,
      },

      lastSessionBackupAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.model(
  "WhatsAppSession",
  WhatsAppSessionSchema
);
5. whatsapp.routes.js
There is another problem here: /send bypasses your whatsapp.send.js service and directly calls client.sendMessage(). �
GitHub
That means it bypasses your message queue/limiter.
Replace it:
Writing
import express from "express";

import { protect } from "../middlewares/authMiddleware1.js";
import WhatsAppSession from "../models/WhatsAppSession.js";

import {
  initWhatsAppUser,
  getWhatsAppState,
  destroyClient,
} from "../services/whatsapp.manager.js";

import {
  sendMessage,
} from "../services/whatsapp.send.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Connect / Restore
|--------------------------------------------------------------------------
*/

router.post(
  "/connect",
  protect,
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(400).json({
          message: "User ID missing",
        });
      }

      await initWhatsAppUser(
        userId
      );

      res.json({
        success: true,
        message:
          "WhatsApp initialization started",
      });
    } catch (error) {
      console.error(
        "[WA ROUTES] /connect:",
        error
      );

      res.status(500).json({
        message:
          "Failed to initialize WhatsApp",
        error: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Runtime status
|--------------------------------------------------------------------------
*/

router.get(
  "/status",
  protect,
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(400).json({
          message: "User ID missing",
        });
      }

      const runtime =
        getWhatsAppState(userId);

      const session =
        await WhatsAppSession.findOne({
          userId,
        }).lean();

      res.json({
        connected:
          runtime.ready,

        ready:
          runtime.ready,

        initialized:
          runtime.initialized,

        requiresQR:
          session?.requiresQR ??
          !runtime.ready,

        state:
          session?.state ??
          "DISCONNECTED",

        qr:
          session?.qr ?? null,

        hasSession:
          session?.hasSession ??
          false,

        lastReadyAt:
          session?.lastReadyAt ??
          null,

        lastAuthenticatedAt:
          session?.lastAuthenticatedAt ??
          null,

        lastError:
          session?.lastError ??
          null,
      });
    } catch (error) {
      console.error(
        "[WA ROUTES] /status:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch WhatsApp status",
        error: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| QR
|--------------------------------------------------------------------------
*/

router.get(
  "/qr",
  protect,
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(400).json({
          message: "User ID missing",
        });
      }

      const session =
        await WhatsAppSession.findOne({
          userId,
        }).lean();

      if (!session?.qr) {
        return res.status(404).json({
          message:
            "QR not available",
        });
      }

      res.json({
        qr: session.qr,
      });
    } catch (error) {
      console.error(
        "[WA ROUTES] /qr:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch QR",
        error: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Send one message
|--------------------------------------------------------------------------
*/

router.post(
  "/send",
  protect,
  async (req, res) => {
    try {
      const userId = req.user?.id;

      const {
        to,
        message,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          message:
            "Not logged in",
        });
      }

      if (!to || !message) {
        return res.status(400).json({
          message:
            "Recipient and message required",
        });
      }

      await sendMessage(
        userId,
        to,
        message
      );

      res.json({
        success: true,
        message:
          "Message sent successfully",
      });
    } catch (error) {
      console.error(
        "[WA ROUTES] /send:",
        error
      );

      res.status(500).json({
        message:
          "Failed to send message",
        error: error.message,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Explicit logout
|--------------------------------------------------------------------------
*/

router.post(
  "/disconnect",
  protect,
  async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(400).json({
          message:
            "User ID missing",
        });
      }

      /*
       * logout=true means:
       *
       * 1. WhatsApp logout
       * 2. delete persisted auth
       * 3. require QR next time
       */
      await destroyClient(
        userId,
        true
      );

      res.json({
        success: true,
        message:
          "WhatsApp logged out",
      });
    } catch (error) {
      console.error(
        "[WA ROUTES] /disconnect:",
        error
      );

      res.status(500).json({
        message:
          "Failed to logout WhatsApp",
        error: error.message,
      });
    }
  }
);

export default router;
6. whatsapp.send.js
Your current send service is already mostly correct because it uses isWhatsAppReady() and the limiter. �
GitHub
I'd simplify and harden it:
Writing
import {
  getClient,
  waitForClientReady,
  isWhatsAppReady,
} from "./whatsapp.manager.js";

import { limiter } from "./messageQueue.js";
import { logger } from "../utils/logger.js";

function normalizeRecipient(to) {
  if (!to) {
    throw new Error(
      "Recipient is required"
    );
  }

  return String(to).trim();
}

export async function sendMessage(
  userId,
  to,
  message
) {
  const recipient =
    normalizeRecipient(to);

  if (!message) {
    throw new Error(
      "Message is required"
    );
  }

  if (
    !isWhatsAppReady(userId)
  ) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }

  const client =
    getClient(userId);

  if (!client) {
    throw new Error(
      `WhatsApp client unavailable for user ${userId}`
    );
  }

  await waitForClientReady(
    userId,
    5_000
  );

  try {
    return await limiter.schedule(
      async () => {
        /*
         * Recheck immediately before sending.
         *
         * WhatsApp can disconnect while a message
         * is waiting in the queue.
         */
        if (
          !isWhatsAppReady(userId)
        ) {
          throw new Error(
            `WhatsApp disconnected before sending to ${recipient}`
          );
        }

        const currentClient =
          getClient(userId);

        if (!currentClient) {
          throw new Error(
            "WhatsApp client unavailable"
          );
        }

        const result =
          await currentClient.sendMessage(
            recipient,
            message
          );

        logger.info(
          `[WA:${userId}] Message sent to ${recipient}`
        );

        return result;
      }
    );
  } catch (error) {
    logger.error(
      `[WA:${userId}] Send failed to ${recipient}: ${error.message}`
    );

    throw error;
  }
}

export async function sendBroadcast(
  userId,
  recipients = [],
  message
) {
  if (!Array.isArray(recipients)) {
    throw new Error(
      "Recipients must be an array"
    );
  }

  if (!recipients.length) {
    return {
      sent: [],
      failed: [],
    };
  }

  const sent = [];
  const failed = [];

  for (const recipient of recipients) {
    try {
      await sendMessage(
        userId,
        recipient,
        message
      );

      sent.push(
        normalizeRecipient(recipient)
      );
    } catch (error) {
      failed.push({
        recipient,
        error: error.message,
      });
    }
  }

  return {
    sent,
    failed,
  };
}
7. broadcastScheduler.js
The scheduler is structurally okay now because it checks runtime readiness. �
GitHub
The important thing is that it must not mark anything failed merely because WhatsApp isn't ready.
Replace it with:
Writing
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
8. broadcast.service.js
This is where we fix a major broadcast bug.
Your current code changes a failed contact to "failed" and then eventually marks the entire broadcast "failed" and disables scheduling. �
GitHub
That means:
WhatsApp temporarily unavailable
        ↓
send fails
        ↓
contact = failed
        ↓
broadcast = failed
        ↓
isScheduled = false
        ↓
NEVER RETRIES
Instead, successful contacts become sent; temporary failures remain pending.
Writing
import Broadcast from "../models/Broadcast.js";

import {
  isWhatsAppReady,
} from "./whatsapp.manager.js";

import {
  sendMessage,
} from "./whatsapp.send.js";

import { logger } from "../utils/logger.js";

export async function broadcastMessage(
  broadcastId
) {
  const broadcast =
    await Broadcast.findById(
      broadcastId
    );

  if (!broadcast) {
    throw new Error(
      "Broadcast not found"
    );
  }

  const userId =
    String(broadcast.userId);

  /*
   * Runtime WhatsApp state is the
   * only authority.
   */
  if (
    !isWhatsAppReady(userId)
  ) {
    throw new Error(
      `WhatsApp is not ready for user ${userId}`
    );
  }

  let sentCount = 0;
  let failedCount = 0;

  for (
    const contactObj of
    broadcast.contacts
  ) {
    /*
     * Already delivered.
     */
    if (
      contactObj.status === "sent"
    ) {
      sentCount++;
      continue;
    }

    /*
     * Check before every recipient.
     *
     * If WhatsApp disconnects halfway through
     * the broadcast, stop immediately.
     */
    if (
      !isWhatsAppReady(userId)
    ) {
      logger.warn(
        `[Broadcast:${broadcast._id}] WhatsApp disconnected. Pausing broadcast.`
      );

      break;
    }

    try {
      await sendMessage(
        userId,
        contactObj.contact,
        broadcast.message
      );

      contactObj.status =
        "sent";

      contactObj.sentAt =
        new Date();

      sentCount++;

      /*
       * Persist immediately.
       *
       * If Node crashes at recipient #50,
       * recipients #1-49 remain sent and
       * the next run starts from #50.
       */
      await broadcast.save();

    } catch (error) {
      failedCount++;

      /*
       * IMPORTANT:
       *
       * Do NOT mark the contact permanently failed.
       *
       * Keep it pending so the next scheduler
       * cycle can retry it.
       */
      contactObj.status =
        "pending";

      await broadcast.save();

      logger.error(
        `[Broadcast:${broadcast._id}] Failed for ${contactObj.contact}: ${error.message}`
      );

      /*
       * If WhatsApp itself went down, stop
       * processing this broadcast immediately.
       */
      if (
        !isWhatsAppReady(userId)
      ) {
        break;
      }
    }
  }

  const pending =
    broadcast.contacts.some(
      (contact) =>
        contact.status ===
        "pending"
    );

  const allSent =
    broadcast.contacts.length > 0 &&
    broadcast.contacts.every(
      (contact) =>
        contact.status === "sent"
    );

  if (allSent) {
    broadcast.status =
      "sent";

    broadcast.isScheduled =
      false;

    broadcast.sentAt =
      new Date();
  } else if (pending) {
    /*
     * Keep it alive.
     */
    broadcast.status =
      "pending";

    broadcast.isScheduled =
      true;
  }

  await broadcast.save();

  logger.info(
    `[Broadcast:${broadcast._id}] Result: sent=${sentCount}, failed=${failedCount}, pending=${broadcast.contacts.filter(
      (c) => c.status === "pending"
    ).length}, status=${broadcast.status}`
  );

  return {
    broadcastId:
      broadcast._id,

    sentCount,

    failedCount,

    pendingCount:
      broadcast.contacts.filter(
        (c) =>
          c.status === "pending"
      ).length,

    status:
      broadcast.status,
  };
}
9. Broadcast.js
No major rewrite needed, but I'd add retry metadata so later we can introduce retry limits instead of retrying a permanently invalid number forever.
For now:
Writing
import mongoose from "mongoose";

const contactSchema =
  new mongoose.Schema({
    contact: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "sent",
        "failed",
      ],
      default: "pending",
    },

    sentAt: {
      type: Date,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },

    lastAttemptAt: {
      type: Date,
      default: null,
    },
  });

const broadcastSchema =
  new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      message: {
        type: String,
        required: true,
      },

      contacts: [
        contactSchema,
      ],

      status: {
        type: String,
        enum: [
          "pending",
          "sent",
          "failed",
          "canceled",
        ],
        default: "pending",
      },

      sentAt: {
        type: Date,
        default: null,
      },

      scheduledFor: {
        type: Date,
        required: false,
      },

      isScheduled: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    }
  );

export default mongoose.model(
  "Broadcast",
  broadcastSchema
);
Then update the catch in broadcast.service.js to record attempts:
contactObj.attempts =
  (contactObj.attempts || 0) + 1;

contactObj.lastError =
  error.message;

contactObj.lastAttemptAt =
  new Date();

contactObj.status = "pending";
10. server.js
There is an important startup sequencing issue in the current server. It starts HTTP, restores WhatsApp, then starts the scheduler. �
GitHub
That's not terrible, but restoration doesn't mean READY.
We want the scheduler running regardless, because it can wait for the actual ready event.
Replace the startup section with:
Writing
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

    console.error(
      error.stack
    );

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
     * 4. Restore persisted WhatsApp
     * authentication.
     *
     * IMPORTANT:
     *
     * This reads:
     *
     * Development -> LocalAuth
     * Production  -> Supabase
     *
     * NOT MongoDB.
     */
    try {
      await initAllWhatsAppUsers();

      logger.info(
        "WhatsApp restoration initiated"
      );
    } catch (error) {
      /*
       * WhatsApp restoration failure should
       * NOT kill the HTTP API.
       */
      logger.error(
        `WhatsApp restoration failed: ${error.message}`
      );
    }

    /*
     * 5. Start scheduler.
     *
     * It waits for runtime WhatsApp readiness.
     */
    startBroadcastScheduler();

    logger.info(
      "Broadcast scheduler started"
    );

  } catch (error) {
    logger.error(
      `Server startup failed: ${error.message}`
    );

    console.error(
      error
    );

    process.exit(1);
  }
}

startServer();
What this fixes
The current repo has the right general idea of using readyClients, but it still restores sessions from MongoDB's hasSession field. �
GitHub
After this rewrite:
First QR login
/connect
   ↓
LocalAuth / RemoteAuth
   ↓
QR
   ↓
authenticated
   ↓
ready
   ↓
readyClients.add(userId)
Restart
Development:
./wwebjs_auth/session-USER_ID
             ↓
discover session
             ↓
LocalAuth restores it
             ↓
ready
Production:
Supabase
   ↓
discover session
   ↓
RemoteAuth restores it
   ↓
ready
Broadcast
Scheduler
   ↓
isWhatsAppReady(userId)?
   │
   ├── NO → leave pending
   │
   └── YES
         ↓
    sendMessage()
         ↓
    queue/limiter
         ↓
    WhatsApp client
If WhatsApp disconnects halfway
Recipient 1 → SENT
Recipient 2 → SENT
Recipient 3 → SENT
Recipient 4 → WhatsApp disconnects
                         ↓
                   stop broadcast
                         ↓
              recipient 4 remains pending
                         ↓
                  WhatsApp reconnects
                         ↓
                    READY event
                         ↓
                  scheduler retries
                         ↓
                 recipient 4 → SENT
Auto responder
Nothing fundamental changes:
WhatsApp client
      ↓
"message"
      ↓
handleIncomingMessage()
      ↓
autoReplyHandler()
      ↓
intent evaluation
      ↓
lead resolution
Your existing dispatcher already follows that pipeline. �
GitHub
One caveat: I would make the retry system smarter after this baseline works—specifically, distinguish a temporary WhatsApp failure from a permanently invalid recipient so one bad number doesn't retry forever.
The most important change is now clean: **MongoDB is application/status data; the WhatsApp auth store is the actual WhatsApp persistence layer.**