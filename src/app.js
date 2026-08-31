import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";

import leadsRoutes from "./routes/leads.routes.js";
import templatesRoutes from "./routes/templates.routes.js";
import broadcastRoutes from "./routes/broadcast.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import whatsappRouter from "./routes/whatsapp.routes.js";
import templateRoutes from "./routes/templates.routes.js";
import autoReplyRoutes from "./routes/autoReply.routes.js";
import userRoutes from "./routes/user.routes.js";

import { errorHandler } from "./middlewares/errorHandler.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- MongoDB session setup for web login ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// --- Routes ---
app.get("/", (req, res) => res.send("Whatsapp Automator is running"));

app.use("/settings", settingsRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/broadcast", broadcastRoutes);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/templates", templateRoutes);
app.use("/api/auto-replies", autoReplyRoutes);
app.use("/api/users", userRoutes);

app.use(errorHandler);

export default app;