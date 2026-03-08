export interface ColumnDef {
  name: string;
  type: string;
  relationTarget?: string;
  relationDisplay?: string;
  displayType?: string;
  position: number;
}

export interface TableInfo {
  name: string;
  columns: ColumnDef[];
  recordCount: number;
}

export type RecordValue = string | number | boolean | null;
export type RecordData = Record<string, RecordValue>;

export interface KuraRecord {
  id: number;
  data: RecordData;
  created_at: string;
  updated_at: string;
}

export interface ListResponse {
  records: KuraRecord[];
  rawRecords: KuraRecord[];
  total: number;
  limit: number | null;
  offset: number;
}

export interface RecordDetailResponse {
  record: KuraRecord;
  rawRecord: KuraRecord;
}

export interface SearchResult {
  table: string;
  id: number;
  data: RecordData;
  matchedColumn: string;
  snippet: string;
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
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
}

export const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  int: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  real: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  bool: [
    { value: "eq", label: "is" },
  ],
  relation: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  "relation[]": [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};
