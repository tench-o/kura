export interface ColumnDef {
  name: string;
  type: string;
  relationTarget?: string;
  relationDisplay?: string;
  displayType?: string;
  alias?: string;
  position: number;
}

export interface TableInfo {
  name: string;
  columns: ColumnDef[];
  recordCount: number;
  aiContext?: string;
  alias?: string;
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

export const DATE_SPECIAL_OPERATORS = [
  "between", "this_week", "this_month", "last_month", "next_month",
] as const;
export type DateSpecialOperator = (typeof DATE_SPECIAL_OPERATORS)[number];

export type DateFilterOperator = FilterOperator | DateSpecialOperator;

export interface FilterCondition {
  id: string;
  column: string;
  operator: FilterOperator | DateSpecialOperator;
  value: string;
  valueEnd?: string;
}

export const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator | DateSpecialOperator; label: string }[]> = {
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
  date: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "gt", label: "after" },
    { value: "lt", label: "before" },
    { value: "gte", label: "on or after" },
    { value: "lte", label: "on or before" },
    { value: "between", label: "is between" },
    { value: "this_week", label: "is this week" },
    { value: "this_month", label: "is this month" },
    { value: "last_month", label: "is last month" },
    { value: "next_month", label: "is next month" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};
