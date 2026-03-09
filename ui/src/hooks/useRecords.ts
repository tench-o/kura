import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import type { KuraRecord, ListResponse, FilterCondition } from "../types";

const PAGE_SIZE = 50;

function loadFilters(tableName: string): FilterCondition[] {
  try {
    const raw = localStorage.getItem(`kura:filters:${tableName}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f: unknown): f is FilterCondition =>
        typeof f === "object" && f !== null && "id" in f && "column" in f && "operator" in f,
    );
  } catch {
    return [];
  }
}

function saveFilters(tableName: string, filters: FilterCondition[]): void {
  if (filters.length === 0) {
    localStorage.removeItem(`kura:filters:${tableName}`);
  } else {
    localStorage.setItem(`kura:filters:${tableName}`, JSON.stringify(filters));
  }
}

export function useRecords(table: string | null) {
  const [records, setRecords] = useState<KuraRecord[]>([]);
  const [rawRecords, setRawRecords] = useState<KuraRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<string | undefined>();
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevTable = useRef<string | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!table) return;
    try {
      setLoading(true);
      const data: ListResponse = await api.listRecords(table, {
        sort,
        limit: PAGE_SIZE,
        offset,
        filters: filters.length > 0 ? filters : undefined,
      });
      setRecords(data.records);
      setRawRecords(data.rawRecords);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [table, sort, offset, filters]);

  useEffect(() => {
    if (table === prevTable.current) return;
    prevTable.current = table;
    setOffset(0);
    setSort(undefined);
    setFilters(table ? loadFilters(table) : []);
  }, [table]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSetFilters = useCallback((newFilters: FilterCondition[]) => {
    setFilters(newFilters);
    setOffset(0);
    if (table) saveFilters(table, newFilters);
  }, [table]);

  const toggleSort = useCallback((column: string) => {
    setSort((prev) => {
      if (prev === column) return `-${column}`;
      if (prev === `-${column}`) return undefined;
      return column;
    });
  }, []);

  const nextPage = useCallback(() => {
    if (offset + PAGE_SIZE < total) {
      setOffset((o) => o + PAGE_SIZE);
    }
  }, [offset, total]);

  const prevPage = useCallback(() => {
    setOffset((o) => Math.max(0, o - PAGE_SIZE));
  }, []);

  return {
    records,
    rawRecords,
    total,
    offset,
    sort,
    filters,
    setFilters: handleSetFilters,
    loading,
    error,
    pageSize: PAGE_SIZE,
    toggleSort,
    nextPage,
    prevPage,
    refresh: fetchRecords,
  };
}
