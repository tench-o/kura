import type { TableInfo, ListResponse, RecordDetailResponse, KuraRecord, RecordData, SearchResult } from "../types";

const BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

function jsonBody(data: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

// Tables
export const api = {
  listTables(): Promise<TableInfo[]> {
    return fetchJSON("/tables");
  },

  describeTable(name: string): Promise<TableInfo> {
    return fetchJSON(`/tables/${encodeURIComponent(name)}`);
  },

  createTable(name: string, columns: string[]): Promise<{ success: boolean }> {
    return fetchJSON("/tables", jsonBody({ name, columns }));
  },

  deleteTable(name: string): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(name)}`, { method: "DELETE" });
  },

  addColumn(table: string, column: string): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/columns`, jsonBody({ column }));
  },

  // Records
  listRecords(
    table: string,
    opts?: { sort?: string; limit?: number; offset?: number; where?: Record<string, string> },
  ): Promise<ListResponse> {
    const params = new URLSearchParams();
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
    if (opts?.where) {
      for (const [k, v] of Object.entries(opts.where)) {
        params.set(`where.${k}`, v);
      }
    }
    const qs = params.toString();
    return fetchJSON(`/tables/${encodeURIComponent(table)}/records${qs ? `?${qs}` : ""}`);
  },

  getRecord(table: string, id: number): Promise<RecordDetailResponse> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/records/${id}`);
  },

  addRecord(table: string, data: RecordData): Promise<KuraRecord> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/records`, jsonBody(data));
  },

  updateRecord(table: string, id: number, data: RecordData): Promise<KuraRecord> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/records/${id}`, jsonBody(data, "PATCH"));
  },

  deleteRecord(table: string, id: number): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/records/${id}`, { method: "DELETE" });
  },

  // Search
  search(query: string, table?: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (table) params.set("table", table);
    return fetchJSON(`/search?${params}`);
  },
};
