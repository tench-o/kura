// ============================================================
// Column type definitions
// ============================================================

export const COLUMN_TYPES = ["text", "int", "real", "bool", "relation", "relation[]"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const SQLITE_TYPE_MAP: Record<ColumnType, string> = {
  text: "TEXT",
  int: "INTEGER",
  real: "REAL",
  bool: "INTEGER",
  relation: "INTEGER",
  "relation[]": "TEXT",
};

// ============================================================
// Column & Table definitions
// ============================================================

export interface ColumnDef {
  name: string;
  type: ColumnType;
  relationTarget?: string;   // Target table name (relation types only)
  relationDisplay?: string;  // Column to display from target (default: first text column)
  position: number;
}

export interface TableInfo {
  name: string;
  columns: ColumnDef[];
  recordCount: number;
}

// ============================================================
// Record types
// ============================================================

export type RecordValue = string | number | boolean | null;
export type RecordData = Record<string, RecordValue>;

export interface KuraRecord {
  id: number;
  data: RecordData;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Query options
// ============================================================

export interface ListOptions {
  where?: Record<string, string>;
  sort?: string;           // Column name, prefix with "-" for DESC
  limit?: number;
  offset?: number;
  raw?: boolean;           // If true, don't resolve relations
}

export interface SearchResult {
  table: string;
  id: number;
  data: RecordData;
  matchedColumn: string;
  snippet: string;
}

// ============================================================
// Error types
// ============================================================

export class KuraError extends Error {
  constructor(
    message: string,
    public code: KuraErrorCode,
  ) {
    super(message);
    this.name = "KuraError";
  }
}

export type KuraErrorCode =
  | "TABLE_NOT_FOUND"
  | "TABLE_ALREADY_EXISTS"
  | "RECORD_NOT_FOUND"
  | "INVALID_COLUMN_TYPE"
  | "INVALID_COLUMN_DEF"
  | "COLUMN_ALREADY_EXISTS"
  | "INVALID_DATA"
  | "QUERY_ERROR"
  | "DB_ERROR";

// ============================================================
// Internal metadata table schema
// ============================================================

export const META_TABLE = "_kura_meta";

export const META_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${META_TABLE} (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  column_type TEXT NOT NULL,
  relation_target TEXT,
  relation_display TEXT,
  position INTEGER NOT NULL,
  PRIMARY KEY (table_name, column_name)
)`;

export const RESERVED_COLUMNS = ["id", "created_at", "updated_at"] as const;
