import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

let dbInstance;

export function getDb() {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
    dbInstance = new Database(config.sqlitePath);
    dbInstance.pragma("journal_mode = WAL");
  }

  return dbInstance;
}
