import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const DATA_PATH =
  process.env.WHATSAPP_AUTH_PATH || "./wwebjs_auth";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET =
  process.env.SUPABASE_WHATSAPP_BUCKET ||
  "whatsapp-sessions";

/*
 * Supabase is ONLY required in production.
 *
 * Development:
 *   RemoteAuth/local filesystem
 *   ./wwebjs_auth
 *
 * Production:
 *   Supabase Storage
 */
if (
  IS_PRODUCTION &&
  (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production"
  );
}

/*
 * This client MUST stay server-side.
 *
 * Never expose SUPABASE_SERVICE_ROLE_KEY
 * to the frontend.
 *
 * It is deliberately null in development.
 */
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

/*
 * RemoteAuth session ZIP location in Supabase.
 *
 * Example:
 *   session-123/session-123.zip
 */
function objectPath(session) {
  return `${session}/${session}.zip`;
}

/*
 * Local ZIP location used by RemoteAuth.
 */
function localZipPath(session) {
  return path.resolve(
    DATA_PATH,
    `${session}.zip`
  );
}

export const supabaseWhatsAppStore = {
  /**
   * Check whether a WhatsApp session exists.
   *
   * Production:
   *   Check Supabase Storage.
   *
   * Development:
   *   Check the local filesystem.
   */
  async sessionExists({ session }) {
    /*
     * DEVELOPMENT
     */
    if (!IS_PRODUCTION) {
      try {
        await fs.access(localZipPath(session));

        return true;
      } catch {
        return false;
      }
    }

    /*
     * PRODUCTION
     */
    const folder = session;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, {
        search: `${session}.zip`,
        limit: 10,
      });

    if (error) {
      logger.error(
        `[SUPABASE WA] sessionExists failed for ${session}: ${error.message}`
      );

      throw error;
    }

    return Boolean(
      data?.some(
        (file) => file.name === `${session}.zip`
      )
    );
  },

  /**
   * Save the ZIP created internally by RemoteAuth.
   *
   * Development:
   *   Nothing needs to be uploaded.
   *
   * Production:
   *   Upload ZIP to Supabase Storage.
   */
  async save({ session }) {
    const localPath = localZipPath(session);

    /*
     * DEVELOPMENT
     *
     * RemoteAuth already has the session locally.
     */
    if (!IS_PRODUCTION) {
      logger.info(
        `[LOCAL WA] Session saved locally: ${session}`
      );

      return;
    }

    /*
     * PRODUCTION
     */
    const remotePath = objectPath(session);

    const file = await fs.readFile(localPath);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(remotePath, file, {
        contentType: "application/zip",
        upsert: true,
        cacheControl: "0",
      });

    if (error) {
      logger.error(
        `[SUPABASE WA] Failed to save session ${session}: ${error.message}`
      );

      throw error;
    }

    logger.info(
      `[SUPABASE WA] Session saved: ${session}`
    );
  },

  /**
   * Restore a session ZIP.
   *
   * RemoteAuth gives us the destination path
   * where the ZIP must be written.
   *
   * Development:
   *   Session already exists locally.
   *
   * Production:
   *   Download from Supabase Storage.
   */
  async extract({
    session,
    path: destinationPath,
  }) {
    /*
     * DEVELOPMENT
     *
     * Nothing to download.
     */
    if (!IS_PRODUCTION) {
      logger.info(
        `[LOCAL WA] Session already available locally: ${session}`
      );

      return;
    }

    /*
     * PRODUCTION
     */
    const remotePath = objectPath(session);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(remotePath);

    if (error) {
      logger.error(
        `[SUPABASE WA] Failed to download session ${session}: ${error.message}`
      );

      throw error;
    }

    if (!data) {
      throw new Error(
        `No session data returned from Supabase for ${session}`
      );
    }

    const arrayBuffer = await data.arrayBuffer();

    await fs.mkdir(
      path.dirname(destinationPath),
      {
        recursive: true,
      }
    );

    await fs.writeFile(
      destinationPath,
      Buffer.from(arrayBuffer)
    );

    logger.info(
      `[SUPABASE WA] Session restored locally: ${session}`
    );
  },

  /**
   * Delete a WhatsApp session.
   *
   * This should only happen after an explicit logout.
   *
   * Development:
   *   Delete the local session ZIP.
   *
   * Production:
   *   Delete the Supabase object.
   */
  async delete({ session }) {
    /*
     * DEVELOPMENT
     */
    if (!IS_PRODUCTION) {
      try {
        await fs.rm(localZipPath(session), {
          force: true,
        });

        logger.info(
          `[LOCAL WA] Session deleted: ${session}`
        );
      } catch (error) {
        logger.error(
          `[LOCAL WA] Failed to delete session ${session}: ${error.message}`
        );

        throw error;
      }

      return;
    }

    /*
     * PRODUCTION
     */
    const remotePath = objectPath(session);

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([remotePath]);

    if (error) {
      logger.error(
        `[SUPABASE WA] Failed to delete session ${session}: ${error.message}`
      );

      throw error;
    }

    logger.info(
      `[SUPABASE WA] Remote session deleted: ${session}`
    );
  },
};