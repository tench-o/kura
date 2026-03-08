import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { KuraRecord, ListResponse } from "../types";

const PAGE_SIZE = 50;

export function useRecords(table: string | null) {
  const [records, setRecords] = useState<KuraRecord[]>([]);
  const [rawRecords, setRawRecords] = useState<KuraRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!table) return;
    try {
      setLoading(true);
      const data: ListResponse = await api.listRecords(table, {
        sort,
        limit: PAGE_SIZE,
        offset,
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
  }, [table, sort, offset]);

  useEffect(() => {
    setOffset(0);
  }, [table]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

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
    loading,
    error,
    pageSize: PAGE_SIZE,
    toggleSort,
    nextPage,
    prevPage,
    refresh: fetchRecords,
  };
}
