import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { META_TABLE_DDL } from "./types.js";

const KURA_DIR = path.join(os.homedir(), ".kura");

export function getDbPath(dbName?: string): string {
  if (dbName && path.isAbsolute(dbName)) {
    return dbName;
  }
  const name = dbName ?? "default";
  return path.join(KURA_DIR, `${name}.db`);
}

export function openDatabase(dbPath: string): Database.Database {
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma("journal_mode = WAL");

  // Initialize metadata table
  db.exec(META_TABLE_DDL);

  return db;
}

export function openMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(META_TABLE_DDL);
  return db;
}
