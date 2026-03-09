import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { META_TABLE, META_TABLE_DDL, AI_CONTEXT_TABLE_DDL, TABLE_META_TABLE_DDL } from "./types.js";

const KURA_DIR = path.join(os.homedir(), ".kura");

export function getDbPath(dbName?: string): string {
  if (dbName && path.isAbsolute(dbName)) {
    return dbName;
  }
  const name = dbName ?? "default";
  return path.join(KURA_DIR, `${name}.db`);
}

/**
 * Migrate _kura_meta schema for older databases.
 * Adds columns that didn't exist in earlier versions.
 */
function migrateMetaTable(db: Database.Database): void {
  const cols = db.pragma(`table_info(${META_TABLE})`) as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("display_type")) {
    db.exec(`ALTER TABLE ${META_TABLE} ADD COLUMN display_type TEXT`);
  }
  if (!colNames.has("ai_context")) {
    db.exec(`ALTER TABLE ${META_TABLE} ADD COLUMN ai_context TEXT`);
  }
  if (!colNames.has("alias")) {
    db.exec(`ALTER TABLE ${META_TABLE} ADD COLUMN alias TEXT`);
  }
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

  // Initialize metadata tables
  db.exec(META_TABLE_DDL);
  db.exec(AI_CONTEXT_TABLE_DDL);
  db.exec(TABLE_META_TABLE_DDL);

  // Migrate older databases
  migrateMetaTable(db);

  return db;
}

export function openMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(META_TABLE_DDL);
  db.exec(AI_CONTEXT_TABLE_DDL);
  db.exec(TABLE_META_TABLE_DDL);
  return db;
}
