import type { TableInfo, ListResponse, RecordDetailResponse, KuraRecord, RecordData, SearchResult, FilterCondition, DateSpecialOperator } from "../types";
import { DATE_SPECIAL_OPERATORS } from "../types";

const BASE = "/api";

function getMonthRange(year: number, month: number): [string, string] {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [start, end];
}

function getWeekRange(today: Date): [string, string] {
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [fmt(monday), fmt(sunday)];
}

export function expandDateFilters(
  filters: FilterCondition[],
): { column: string; operator: string; value: string }[] {
  const result: { column: string; operator: string; value: string }[] = [];
  for (const f of filters) {
    if (!DATE_SPECIAL_OPERATORS.includes(f.operator as DateSpecialOperator)) {
      if (f.operator === "is_empty" || f.operator === "is_not_empty" || f.value !== "") {
        result.push({ column: f.column, operator: f.operator, value: f.value });
      }
      continue;
    }
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    switch (f.operator) {
      case "between": {
        if (f.value) result.push({ column: f.column, operator: "gte", value: f.value });
        if (f.valueEnd) result.push({ column: f.column, operator: "lte", value: f.valueEnd });
        break;
      }
      case "this_month": {
        const [start, end] = getMonthRange(year, month);
        result.push({ column: f.column, operator: "gte", value: start });
        result.push({ column: f.column, operator: "lte", value: end });
        break;
      }
      case "last_month": {
        const lm = month === 1 ? 12 : month - 1;
        const ly = month === 1 ? year - 1 : year;
        const [start, end] = getMonthRange(ly, lm);
        result.push({ column: f.column, operator: "gte", value: start });
        result.push({ column: f.column, operator: "lte", value: end });
        break;
      }
      case "next_month": {
        const nm = month === 12 ? 1 : month + 1;
        const ny = month === 12 ? year + 1 : year;
        const [start, end] = getMonthRange(ny, nm);
        result.push({ column: f.column, operator: "gte", value: start });
        result.push({ column: f.column, operator: "lte", value: end });
        break;
      }
      case "this_week": {
        const [start, end] = getWeekRange(today);
        result.push({ column: f.column, operator: "gte", value: start });
        result.push({ column: f.column, operator: "lte", value: end });
        break;
      }
    }
  }
  return result;
}

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

  modifyColumn(table: string, column: string, displayType: string | null): Promise<{ success: boolean }> {
    return fetchJSON(
      `/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`,
      jsonBody({ display_type: displayType }, "PATCH"),
    );
  },

  // Records
  listRecords(
    table: string,
    opts?: { sort?: string; limit?: number; offset?: number; where?: Record<string, string>; filters?: FilterCondition[] },
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
    if (opts?.filters && opts.filters.length > 0) {
      const toSend = expandDateFilters(opts.filters);
      if (toSend.length > 0) {
        params.set("filters", JSON.stringify(toSend));
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

  // Alias
  setTableAlias(table: string, alias: string | null): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/alias`, jsonBody({ alias }, "PUT"));
  },

  setColumnAlias(table: string, column: string, alias: string | null): Promise<{ success: boolean }> {
    return fetchJSON(
      `/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}/alias`,
      jsonBody({ alias }, "PUT"),
    );
  },

  // Rename column
  renameColumn(table: string, oldName: string, newName: string): Promise<{ success: boolean }> {
    return fetchJSON(
      `/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(oldName)}/rename`,
      jsonBody({ name: newName }, "PUT"),
    );
  },

  // AI Context
  getAiContext(table: string): Promise<{ database?: string; tables?: { name: string; aiContext: string }[]; columns?: { name: string; aiContext: string }[] }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/ai-context`);
  },

  setAiContext(table: string, context: string): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/ai-context`, jsonBody({ context }, "PUT"));
  },

  clearAiContext(table: string): Promise<{ success: boolean }> {
    return fetchJSON(`/tables/${encodeURIComponent(table)}/ai-context`, { method: "DELETE" });
  },

  // Search
  search(query: string, table?: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (table) params.set("table", table);
    return fetchJSON(`/search?${params}`);
  },
};
