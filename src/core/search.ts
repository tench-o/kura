import type Database from "better-sqlite3";
import type { SearchResult } from "./types.js";
import { META_TABLE } from "./types.js";

/**
 * Get all text columns for a given table from _kura_meta.
 */
function getTextColumns(db: Database.Database, tableName: string): string[] {
  const rows = db
    .prepare(
      `SELECT column_name FROM ${META_TABLE}
       WHERE table_name = ? AND column_type = 'text'
       ORDER BY position`,
    )
    .all(tableName) as Array<{ column_name: string }>;
  return rows.map((r) => r.column_name);
}

/**
 * Get all user table names from _kura_meta.
 */
function getUserTables(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT table_name FROM ${META_TABLE}`)
    .all() as Array<{ table_name: string }>;
  return rows.map((r) => r.table_name);
}

/**
 * FTS table name for a given user table.
 */
function ftsTableName(tableName: string): string {
  return `_kura_fts_${tableName}`;
}

/**
 * Ensure that an FTS5 virtual table and sync triggers exist for the given table.
 * If the table has no text columns, this is a no-op.
 *
 * Uses content='{table}' with content_rowid='id' so FTS rowid maps to the source table's id.
 */
export function ensureFTS(db: Database.Database, tableName: string): void {
  const textCols = getTextColumns(db, tableName);
  if (textCols.length === 0) return;

  const fts = ftsTableName(tableName);
  const colList = textCols.map((c) => `"${c}"`).join(", ");

  // Create FTS5 virtual table backed by the content table
  // Use trigram tokenizer for CJK (Japanese, Chinese, Korean) support
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS "${fts}" USING fts5(${colList}, content='${tableName}', content_rowid='id', tokenize='trigram')`,
  );

  // Check if triggers already exist
  const triggerExists = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?`,
    )
    .get(`_kura_fts_ai_${tableName}`) as { name: string } | undefined;

  if (triggerExists) return;

  const colSelectList = textCols.map((c) => `NEW."${c}"`).join(", ");
  const oldColSelectList = textCols.map((c) => `OLD."${c}"`).join(", ");

  // AFTER INSERT trigger
  db.exec(`
    CREATE TRIGGER "_kura_fts_ai_${tableName}" AFTER INSERT ON "${tableName}" BEGIN
      INSERT INTO "${fts}"(rowid, ${colList}) VALUES (NEW.id, ${colSelectList});
    END
  `);

  // AFTER UPDATE trigger — delete old entry then insert new
  db.exec(`
    CREATE TRIGGER "_kura_fts_au_${tableName}" AFTER UPDATE ON "${tableName}" BEGIN
      INSERT INTO "${fts}"("${fts}", rowid, ${colList}) VALUES ('delete', OLD.id, ${oldColSelectList});
      INSERT INTO "${fts}"(rowid, ${colList}) VALUES (NEW.id, ${colSelectList});
    END
  `);

  // AFTER DELETE trigger
  db.exec(`
    CREATE TRIGGER "_kura_fts_ad_${tableName}" AFTER DELETE ON "${tableName}" BEGIN
      INSERT INTO "${fts}"("${fts}", rowid, ${colList}) VALUES ('delete', OLD.id, ${oldColSelectList});
    END
  `);

  // Populate FTS from existing data
  db.exec(
    `INSERT INTO "${fts}"(rowid, ${colList}) SELECT id, ${colList} FROM "${tableName}"`,
  );
}

/**
 * Search across one or more tables using FTS5 MATCH.
 *
 * If `tables` is not specified, searches all user tables that have text columns.
 */
export function search(
  db: Database.Database,
  query: string,
  tables?: string[],
): SearchResult[] {
  const targetTables = tables ?? getUserTables(db);
  const results: SearchResult[] = [];

  // Trigram tokenizer requires query length >= 3 for MATCH.
  // For shorter queries, fall back to LIKE search on actual table columns.
  const uselike = [...query].length < 3;

  for (const tableName of targetTables) {
    try {
      const textCols = getTextColumns(db, tableName);
      if (textCols.length === 0) continue;

      if (uselike) {
        // LIKE fallback for short queries
        const likeConditions = textCols
          .map((c) => `"${c}" LIKE ?`)
          .join(" OR ");
        const likeParams = textCols.map(() => `%${query}%`);
        const rows = db
          .prepare(
            `SELECT * FROM "${tableName}" WHERE ${likeConditions}`,
          )
          .all(...likeParams) as Array<Record<string, unknown>>;

        for (const row of rows) {
          const data: Record<string, string | number | boolean | null> = {};
          let matchedCol = textCols[0];
          for (const col of textCols) {
            const val = row[col];
            data[col] =
              val === null || val === undefined ? null : (val as string | number | boolean);
            if (val && String(val).includes(query)) {
              matchedCol = col;
            }
          }
          results.push({
            table: tableName,
            id: row.id as number,
            data,
            matchedColumn: matchedCol,
            snippet: String(data[matchedCol] ?? ""),
          });
        }
      } else {
        // FTS5 MATCH for queries with 3+ characters
        ensureFTS(db, tableName);

        const fts = ftsTableName(tableName);

        const rows = db
          .prepare(
            `SELECT rowid, snippet("${fts}", 0, '<<', '>>', '...', 32) AS snippet
             FROM "${fts}" WHERE "${fts}" MATCH ?`,
          )
          .all(query) as Array<{ rowid: number; snippet: string }>;

        for (const row of rows) {
          const record = db
            .prepare(`SELECT * FROM "${tableName}" WHERE id = ?`)
            .get(row.rowid) as Record<string, unknown> | undefined;

          const data: Record<string, string | number | boolean | null> = {};
          if (record) {
            for (const col of textCols) {
              const val = record[col];
              data[col] =
                val === null || val === undefined ? null : (val as string | number | boolean);
            }
          }

          results.push({
            table: tableName,
            id: row.rowid,
            data,
            matchedColumn: textCols[0],
            snippet: row.snippet,
          });
        }
      }
    } catch {
      // Gracefully skip tables where FTS fails
      continue;
    }
  }

  return results;
}

/**
 * Drop and recreate FTS table and triggers for a given table.
 */
export function rebuildFTS(db: Database.Database, tableName: string): void {
  const fts = ftsTableName(tableName);

  // Drop triggers
  db.exec(`DROP TRIGGER IF EXISTS "_kura_fts_ai_${tableName}"`);
  db.exec(`DROP TRIGGER IF EXISTS "_kura_fts_au_${tableName}"`);
  db.exec(`DROP TRIGGER IF EXISTS "_kura_fts_ad_${tableName}"`);

  // Drop FTS table
  db.exec(`DROP TABLE IF EXISTS "${fts}"`);

  // Recreate
  ensureFTS(db, tableName);
}
