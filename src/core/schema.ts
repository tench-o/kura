import type Database from "better-sqlite3";
import {
  type ColumnDef,
  type ColumnType,
  type TableInfo,
  COLUMN_TYPES,
  SQLITE_TYPE_MAP,
  META_TABLE,
  KuraError,
} from "./types.js";

// ============================================================
// Reserved table names
// ============================================================

const RESERVED_TABLE_NAMES = new Set([META_TABLE, "sqlite_master", "sqlite_sequence"]);

// ============================================================
// Parse column definition
// ============================================================

export function parseColumnDef(def: string): ColumnDef {
  // Formats:
  //   "name:text"
  //   "name:text/select"        (with display type)
  //   "company:relation(companies)"
  //   "tags:relation[](tags)"
  const match = def.match(/^([^:]+):(.+)$/);
  if (!match) {
    throw new KuraError(`Invalid column definition: "${def}"`, "INVALID_COLUMN_DEF");
  }

  const name = match[1];
  const rawType = match[2];

  // Check for relation types with target
  const relationMatch = rawType.match(/^(relation\[\]|relation)\(([^)]+)\)$/);
  if (relationMatch) {
    const type = relationMatch[1] as ColumnType;
    const relationTarget = relationMatch[2];
    return { name, type, relationTarget, position: 0 };
  }

  // Check for type/display format (e.g. "text/select", "int/currency")
  const displayMatch = rawType.match(/^([^/]+)\/(.+)$/);
  if (displayMatch) {
    const baseType = displayMatch[1];
    const displayType = displayMatch[2];
    if (!COLUMN_TYPES.includes(baseType as ColumnType)) {
      throw new KuraError(
        `Invalid column type: "${baseType}". Valid types: ${COLUMN_TYPES.join(", ")}`,
        "INVALID_COLUMN_TYPE",
      );
    }
    return { name, type: baseType as ColumnType, displayType, position: 0 };
  }

  // Plain type
  if (!COLUMN_TYPES.includes(rawType as ColumnType)) {
    throw new KuraError(
      `Invalid column type: "${rawType}". Valid types: ${COLUMN_TYPES.join(", ")}`,
      "INVALID_COLUMN_TYPE",
    );
  }

  return { name, type: rawType as ColumnType, position: 0 };
}

// ============================================================
// Create table
// ============================================================

export function createTable(db: Database.Database, name: string, columns: ColumnDef[]): void {
  validateTableName(name);

  if (tableExists(db, name)) {
    throw new KuraError(`Table "${name}" already exists`, "TABLE_ALREADY_EXISTS");
  }

  // Build column definitions for CREATE TABLE
  const colDefs = columns.map((col) => {
    const sqlType = SQLITE_TYPE_MAP[col.type];
    return `"${col.name}" ${sqlType}`;
  });

  const createSQL = [
    `CREATE TABLE "${name}" (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    ...colDefs.map((d) => `  ${d},`),
    `  created_at TEXT DEFAULT (datetime('now')),`,
    `  updated_at TEXT DEFAULT (datetime('now'))`,
    `)`,
  ].join("\n");

  const triggerSQL = `CREATE TRIGGER "_kura_updated_${name}" AFTER UPDATE ON "${name}" BEGIN UPDATE "${name}" SET updated_at = datetime('now') WHERE id = NEW.id; END;`;

  const insertMeta = db.prepare(
    `INSERT INTO ${META_TABLE} (table_name, column_name, column_type, display_type, relation_target, relation_display, position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const transaction = db.transaction(() => {
    db.exec(createSQL);
    db.exec(triggerSQL);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      insertMeta.run(
        name,
        col.name,
        col.type,
        col.displayType ?? null,
        col.relationTarget ?? null,
        col.relationDisplay ?? null,
        i,
      );
    }
  });

  transaction();
}

// ============================================================
// List tables
// ============================================================

export function listTables(db: Database.Database): TableInfo[] {
  const rows = db
    .prepare(
      `SELECT table_name, column_name, column_type, display_type, relation_target, relation_display, position
       FROM ${META_TABLE}
       ORDER BY table_name, position`,
    )
    .all() as Array<{
    table_name: string;
    column_name: string;
    column_type: ColumnType;
    display_type: string | null;
    relation_target: string | null;
    relation_display: string | null;
    position: number;
  }>;

  // Group by table_name
  const tableMap = new Map<string, ColumnDef[]>();
  for (const row of rows) {
    if (!tableMap.has(row.table_name)) {
      tableMap.set(row.table_name, []);
    }
    tableMap.get(row.table_name)!.push({
      name: row.column_name,
      type: row.column_type,
      displayType: row.display_type ?? undefined,
      relationTarget: row.relation_target ?? undefined,
      relationDisplay: row.relation_display ?? undefined,
      position: row.position,
    });
  }

  const result: TableInfo[] = [];
  for (const [tableName, columns] of tableMap) {
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
      .get() as { count: number };
    result.push({
      name: tableName,
      columns,
      recordCount: countRow.count,
    });
  }

  return result;
}

// ============================================================
// Describe table
// ============================================================

export function describeTable(db: Database.Database, name: string): TableInfo {
  if (!tableExists(db, name)) {
    throw new KuraError(`Table "${name}" not found`, "TABLE_NOT_FOUND");
  }

  const rows = db
    .prepare(
      `SELECT column_name, column_type, display_type, relation_target, relation_display, position
       FROM ${META_TABLE}
       WHERE table_name = ?
       ORDER BY position`,
    )
    .all(name) as Array<{
    column_name: string;
    column_type: ColumnType;
    display_type: string | null;
    relation_target: string | null;
    relation_display: string | null;
    position: number;
  }>;

  const columns: ColumnDef[] = rows.map((row) => ({
    name: row.column_name,
    type: row.column_type,
    displayType: row.display_type ?? undefined,
    relationTarget: row.relation_target ?? undefined,
    relationDisplay: row.relation_display ?? undefined,
    position: row.position,
  }));

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM "${name}"`)
    .get() as { count: number };

  return { name, columns, recordCount: countRow.count };
}

// ============================================================
// Add column
// ============================================================

export function addColumn(db: Database.Database, tableName: string, column: ColumnDef): void {
  if (!tableExists(db, tableName)) {
    throw new KuraError(`Table "${tableName}" not found`, "TABLE_NOT_FOUND");
  }

  const sqlType = SQLITE_TYPE_MAP[column.type];

  // Get max position
  const maxRow = db
    .prepare(`SELECT MAX(position) as maxPos FROM ${META_TABLE} WHERE table_name = ?`)
    .get(tableName) as { maxPos: number | null };
  const nextPosition = (maxRow.maxPos ?? -1) + 1;

  const transaction = db.transaction(() => {
    db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${sqlType}`);
    db.prepare(
      `INSERT INTO ${META_TABLE} (table_name, column_name, column_type, display_type, relation_target, relation_display, position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tableName,
      column.name,
      column.type,
      column.displayType ?? null,
      column.relationTarget ?? null,
      column.relationDisplay ?? null,
      nextPosition,
    );
  });

  transaction();
}

// ============================================================
// Modify column (display_type)
// ============================================================

export function modifyColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  displayType: string | null,
): void {
  if (!tableExists(db, tableName)) {
    throw new KuraError(`Table "${tableName}" not found`, "TABLE_NOT_FOUND");
  }

  const row = db
    .prepare(`SELECT column_type FROM ${META_TABLE} WHERE table_name = ? AND column_name = ?`)
    .get(tableName, columnName) as { column_type: string } | undefined;

  if (!row) {
    throw new KuraError(
      `Column "${columnName}" not found in table "${tableName}"`,
      "INVALID_DATA",
    );
  }

  db.prepare(
    `UPDATE ${META_TABLE} SET display_type = ? WHERE table_name = ? AND column_name = ?`,
  ).run(displayType, tableName, columnName);
}

// ============================================================
// Drop table
// ============================================================

export function dropTable(db: Database.Database, name: string): void {
  if (!tableExists(db, name)) {
    throw new KuraError(`Table "${name}" not found`, "TABLE_NOT_FOUND");
  }

  const transaction = db.transaction(() => {
    db.exec(`DROP TABLE "${name}"`);
    db.exec(`DROP TRIGGER IF EXISTS "_kura_updated_${name}"`);
    db.prepare(`DELETE FROM ${META_TABLE} WHERE table_name = ?`).run(name);
  });

  transaction();
}

// ============================================================
// Table exists
// ============================================================

export function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM ${META_TABLE} WHERE table_name = ?`)
    .get(name) as { count: number };
  return row.count > 0;
}

// ============================================================
// Validation helpers
// ============================================================

function validateTableName(name: string): void {
  if (!name || name.includes(" ")) {
    throw new KuraError(`Invalid table name: "${name}" (spaces not allowed)`, "INVALID_DATA");
  }
  if (name.startsWith("_")) {
    throw new KuraError(
      `Invalid table name: "${name}" (cannot start with underscore)`,
      "INVALID_DATA",
    );
  }
  if (RESERVED_TABLE_NAMES.has(name)) {
    throw new KuraError(`Invalid table name: "${name}" (reserved name)`, "INVALID_DATA");
  }
}
