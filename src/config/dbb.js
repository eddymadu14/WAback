// import Database from "better-sqlite3";
// import { DB_PATH } from "./env.js";

// export const db = new Database(DB_PATH);

// // Leads table
// db.prepare(`
// CREATE TABLE IF NOT EXISTS leads (
//   id INTEGER PRIMARY KEY AUTOINCREMENT,
//   phone TEXT,
//   name TEXT,
//   message TEXT,
//   status TEXT DEFAULT 'pending',
//   serious INTEGER,
//   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
// )
// `).run();

// // Templates table
// db.prepare(`
// CREATE TABLE IF NOT EXISTS templates (
//   id INTEGER PRIMARY KEY AUTOINCREMENT,
//   name TEXT,
//   keywords TEXT,
//   reply TEXT
// )
// `).run();

// // Settings table
// db.prepare(`
// CREATE TABLE IF NOT EXISTS settings (
//   key TEXT PRIMARY KEY,
//   value TEXT
// )
// `).run();