import crypto from "node:crypto";
import { getDb } from "../lib/db.js";

export function ensureConversationTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      createdAt TEXT NOT NULL
    );
  `);
}

export function createSession() {
  ensureConversationTables();
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO chat_sessions (id, createdAt, updatedAt) VALUES (?, ?, ?)",
  ).run(id, timestamp, timestamp);
  return id;
}

export function ensureSession(sessionId) {
  ensureConversationTables();
  const db = getDb();
  const existing = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(sessionId);
  if (existing) {
    return sessionId;
  }
  const timestamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO chat_sessions (id, createdAt, updatedAt) VALUES (?, ?, ?)",
  ).run(sessionId, timestamp, timestamp);
  return sessionId;
}

export function appendMessage(sessionId, role, content, metadata = {}) {
  ensureConversationTables();
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO chat_messages (id, sessionId, role, content, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, sessionId, role, content, JSON.stringify(metadata), timestamp);
  db.prepare("UPDATE chat_sessions SET updatedAt = ? WHERE id = ?").run(timestamp, sessionId);
  return id;
}

export function getConversationHistory(sessionId, limit = 12) {
  ensureConversationTables();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT role, content, metadata, createdAt
       FROM chat_messages
       WHERE sessionId = ?
       ORDER BY createdAt DESC
       LIMIT ?`,
    )
    .all(sessionId, limit)
    .reverse();

  return rows.map((row) => ({
    role: row.role,
    content: row.content,
    metadata: JSON.parse(row.metadata || "{}"),
    createdAt: row.createdAt,
  }));
}
