
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
