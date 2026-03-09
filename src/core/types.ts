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
  displayType?: string;      // Display hint: select, url, email, date, currency, rating, percent, etc.
  relationTarget?: string;   // Target table name (relation types only)
  relationDisplay?: string;  // Column to display from target (default: first text column)
  aiContext?: string;        // AI-facing context: meaning, rules, usage notes
  alias?: string;            // Human-readable alias for column name
  position: number;
}

export interface TableInfo {
  name: string;
  columns: ColumnDef[];
  recordCount: number;
  aiContext?: string;        // AI-facing context for this table
  alias?: string;            // Human-readable alias for table name
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
// Expanded relation types
// ============================================================

export interface ExpandedRelationRecord {
  id: number;
  [key: string]: RecordValue;
}

export type ExpandedRecordValue = RecordValue | ExpandedRelationRecord | ExpandedRelationRecord[];

export interface ExpandedKuraRecord {
  id: number;
  data: Record<string, ExpandedRecordValue>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Filter types
// ============================================================

export const FILTER_OPERATORS = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "contains", "not_contains", "is_empty", "is_not_empty",
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: string;
}

// ============================================================
// Query options
// ============================================================

export interface ListOptions {
  where?: Record<string, string>;
  filters?: FilterCondition[];
  columns?: string[];      // Columns to return (default: all)
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
  display_type TEXT,
  relation_target TEXT,
  relation_display TEXT,
  ai_context TEXT,
  alias TEXT,
  position INTEGER NOT NULL,
  PRIMARY KEY (table_name, column_name)
)`;

export const RESERVED_COLUMNS = ["id", "created_at", "updated_at"] as const;

// ============================================================
// AI Context table (DB-level and table-level context)
// ============================================================

export const AI_CONTEXT_TABLE = "_kura_ai_context";

export const AI_CONTEXT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${AI_CONTEXT_TABLE} (
  key TEXT NOT NULL PRIMARY KEY,
  ai_context TEXT NOT NULL
)`;

export const AI_CONTEXT_DB_KEY = "__db__";

// ============================================================
// Table metadata table (aliases)
// ============================================================

export const TABLE_META_TABLE = "_kura_table_meta";

export const TABLE_META_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${TABLE_META_TABLE} (
  table_name TEXT NOT NULL PRIMARY KEY,
  alias TEXT
)`;
