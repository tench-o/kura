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
