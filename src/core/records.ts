import type Database from "better-sqlite3";
import {
  type ColumnDef,
  type ColumnType,
  type RecordValue,
  type RecordData,
  type KuraRecord,
  type ListOptions,
  type FilterCondition,
  KuraError,
} from "./types.js";
import { tableExists, describeTable } from "./schema.js";

// ============================================================
// Column validation helper
// ============================================================

function validateColumnExists(column: string, validColumns: Set<string>, tableName: string): void {
  if (!validColumns.has(column)) {
    throw new KuraError(
      `Column "${column}" not found in table "${tableName}"`,
      "INVALID_DATA",
    );
  }
}

// ============================================================
// Value coercion
// ============================================================

export function coerceValue(value: RecordValue, type: ColumnType): RecordValue {
  if (value === null) return null;

  switch (type) {
    case "bool":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value === 1 || value === 0) return value;
      if (value === "true" || value === "1") return 1;
      if (value === "false" || value === "0") return 0;
      return value ? 1 : 0;

    case "int":
    case "relation":
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const n = parseInt(value, 10);
        if (!isNaN(n)) return n;
      }
      return value;

    case "real":
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const n = parseFloat(value);
        if (!isNaN(n)) return n;
      }
      return value;

    case "relation[]":
      if (typeof value === "string") {
        // Already JSON string
        try {
          JSON.parse(value);
          return value;
        } catch {
          return value;
        }
      }
      if (Array.isArray(value)) {
        return JSON.stringify(value);
      }
      return value;

    case "text":
    default:
      if (typeof value !== "string") return String(value);
      return value;
  }
}

// ============================================================
// Row to record conversion
// ============================================================

export function rowToRecord(row: Record<string, unknown>): KuraRecord {
  const { id, created_at, updated_at, ...rest } = row;
  const data: RecordData = {};
  for (const [key, val] of Object.entries(rest)) {
    data[key] = val as RecordValue;
  }
  return {
    id: id as number,
    data,
    created_at: created_at as string,
    updated_at: updated_at as string,
  };
}

// ============================================================
// Add record
// ============================================================

export function addRecord(db: Database.Database, table: string, data: RecordData): KuraRecord {
  if (!tableExists(db, table)) {
    throw new KuraError(`Table "${table}" not found`, "TABLE_NOT_FOUND");
  }

  const tableInfo = describeTable(db, table);
  const columnMap = new Map<string, ColumnDef>();
  for (const col of tableInfo.columns) {
    columnMap.set(col.name, col);
  }

  const keys: string[] = [];
  const values: RecordValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    const colDef = columnMap.get(key);
    if (!colDef) continue; // skip unknown columns
    keys.push(`"${key}"`);
    values.push(coerceValue(value, colDef.type));
  }

  if (keys.length === 0) {
    throw new KuraError("No valid columns provided", "INVALID_DATA");
  }

  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO "${table}" (${keys.join(", ")}) VALUES (${placeholders})`;

  const result = db.prepare(sql).run(...values);
  const inserted = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(result.lastInsertRowid) as Record<string, unknown>;

  return rowToRecord(inserted);
}

// ============================================================
// Get record
// ============================================================

export function getRecord(db: Database.Database, table: string, id: number): KuraRecord {
  if (!tableExists(db, table)) {
    throw new KuraError(`Table "${table}" not found`, "TABLE_NOT_FOUND");
  }

  const row = db
    .prepare(`SELECT * FROM "${table}" WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    throw new KuraError(`Record #${id} not found in "${table}"`, "RECORD_NOT_FOUND");
  }

  return rowToRecord(row);
}

// ============================================================
// Filter SQL builder
// ============================================================

export function buildFilterSQL(
  filters: FilterCondition[],
): { clauses: string[]; params: RecordValue[] } {
  const clauses: string[] = [];
  const params: RecordValue[] = [];

  for (const f of filters) {
    const col = `"${f.column}"`;
    switch (f.operator) {
      case "eq":
        clauses.push(`${col} = ?`);
        params.push(f.value);
        break;
      case "neq":
        clauses.push(`${col} != ?`);
        params.push(f.value);
        break;
      case "gt":
        clauses.push(`${col} > ?`);
        params.push(f.value);
        break;
      case "gte":
        clauses.push(`${col} >= ?`);
        params.push(f.value);
        break;
      case "lt":
        clauses.push(`${col} < ?`);
        params.push(f.value);
        break;
      case "lte":
        clauses.push(`${col} <= ?`);
        params.push(f.value);
        break;
      case "contains":
        clauses.push(`${col} LIKE ?`);
        params.push(`%${f.value}%`);
        break;
      case "not_contains":
        clauses.push(`${col} NOT LIKE ?`);
        params.push(`%${f.value}%`);
        break;
      case "is_empty":
        clauses.push(`(${col} IS NULL OR ${col} = '')`);
        break;
      case "is_not_empty":
        clauses.push(`(${col} IS NOT NULL AND ${col} != '')`);
        break;
    }
  }

  return { clauses, params };
}

// ============================================================
// List records
// ============================================================

export function listRecords(
  db: Database.Database,
  table: string,
  options: ListOptions = {},
): KuraRecord[] {
  // Build valid column set for validation (describeTable also checks table existence)
  const tableInfo = describeTable(db, table);
  const validColumns = new Set<string>(["id", "created_at", "updated_at"]);
  for (const col of tableInfo.columns) {
    validColumns.add(col.name);
  }

  // SELECT columns
  let selectCols = "*";
  if (options.columns && options.columns.length > 0) {
    for (const col of options.columns) {
      validateColumnExists(col, validColumns, table);
    }
    // Always include id, created_at, updated_at for KuraRecord structure
    const colSet = new Set(["id", "created_at", "updated_at", ...options.columns]);
    selectCols = [...colSet].map((c) => `"${c}"`).join(", ");
  }

  let sql = `SELECT ${selectCols} FROM "${table}"`;
  const params: RecordValue[] = [];

  // WHERE clauses
  const conditions: string[] = [];
  if (options.where && Object.keys(options.where).length > 0) {
    for (const [key, value] of Object.entries(options.where)) {
      validateColumnExists(key, validColumns, table);
      conditions.push(`"${key}" = ?`);
      params.push(value);
    }
  }
  if (options.filters && options.filters.length > 0) {
    for (const f of options.filters) {
      validateColumnExists(f.column, validColumns, table);
    }
    const filterResult = buildFilterSQL(options.filters);
    conditions.push(...filterResult.clauses);
    params.push(...filterResult.params);
  }
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // ORDER BY
  if (options.sort) {
    const desc = options.sort.startsWith("-");
    const column = desc ? options.sort.slice(1) : options.sort;
    validateColumnExists(column, validColumns, table);
    const direction = desc ? "DESC" : "ASC";
    sql += ` ORDER BY "${column}" ${direction}`;
  }

  // LIMIT / OFFSET
  if (options.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }
  if (options.offset !== undefined) {
    if (options.limit === undefined) {
      sql += ` LIMIT -1`;
    }
    sql += ` OFFSET ?`;
    params.push(options.offset);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToRecord);
}

// ============================================================
// Update record
// ============================================================

export function updateRecord(
  db: Database.Database,
  table: string,
  id: number,
  data: RecordData,
): KuraRecord {
  if (!tableExists(db, table)) {
    throw new KuraError(`Table "${table}" not found`, "TABLE_NOT_FOUND");
  }

  // Verify record exists
  const existing = db
    .prepare(`SELECT id FROM "${table}" WHERE id = ?`)
    .get(id);
  if (!existing) {
    throw new KuraError(`Record #${id} not found in "${table}"`, "RECORD_NOT_FOUND");
  }

  const tableInfo = describeTable(db, table);
  const columnMap = new Map<string, ColumnDef>();
  for (const col of tableInfo.columns) {
    columnMap.set(col.name, col);
  }

  const setClauses: string[] = [];
  const values: RecordValue[] = [];

  for (const [key, value] of Object.entries(data)) {
    const colDef = columnMap.get(key);
    if (!colDef) continue;
    setClauses.push(`"${key}" = ?`);
    values.push(coerceValue(value, colDef.type));
  }

  if (setClauses.length === 0) {
    throw new KuraError("No valid columns provided", "INVALID_DATA");
  }

  values.push(id);
  const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...values);

  const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown>;
  return rowToRecord(updated);
}

// ============================================================
// Delete record
// ============================================================

export function deleteRecord(db: Database.Database, table: string, id: number): void {
  if (!tableExists(db, table)) {
    throw new KuraError(`Table "${table}" not found`, "TABLE_NOT_FOUND");
  }

  const existing = db
    .prepare(`SELECT id FROM "${table}" WHERE id = ?`)
    .get(id);
  if (!existing) {
    throw new KuraError(`Record #${id} not found in "${table}"`, "RECORD_NOT_FOUND");
  }

  db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
}

// ============================================================
// Count records
// ============================================================

export function countRecords(
  db: Database.Database,
  table: string,
  options?: { where?: Record<string, string>; filters?: FilterCondition[] },
): number {
  // Build valid column set for validation (describeTable also checks table existence)
  const tableInfo = describeTable(db, table);
  const validColumns = new Set<string>(["id", "created_at", "updated_at"]);
  for (const col of tableInfo.columns) {
    validColumns.add(col.name);
  }

  let sql = `SELECT COUNT(*) as count FROM "${table}"`;
  const params: RecordValue[] = [];
  const conditions: string[] = [];

  if (options?.where && Object.keys(options.where).length > 0) {
    for (const [key, value] of Object.entries(options.where)) {
      validateColumnExists(key, validColumns, table);
      conditions.push(`"${key}" = ?`);
      params.push(value);
    }
  }
  if (options?.filters && options.filters.length > 0) {
    for (const f of options.filters) {
      validateColumnExists(f.column, validColumns, table);
    }
    const filterResult = buildFilterSQL(options.filters);
    conditions.push(...filterResult.clauses);
    params.push(...filterResult.params);
  }
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  const row = db.prepare(sql).get(...params) as { count: number };
  return row.count;
}
