
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