import { useState, useCallback } from "react";
import { api } from "../api/client";
import { FilterPanel } from "./FilterPanel";
import type { ColumnDef, FilterCondition, SearchResult } from "../types";

interface ToolbarProps {
  onSearch: (results: SearchResult[] | null) => void;
  table: string;
  sort?: string;
  columns: ColumnDef[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
}

export function Toolbar({ onSearch, table, sort: _sort, columns, filters, onFiltersChange }: ToolbarProps) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const activeCount = filters.filter(
    (f) => f.operator === "is_empty" || f.operator === "is_not_empty" || f.value !== "",
  ).length;

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      onSearch(null);
      return;
    }
    if (value.length >= 3) {
      try {
        const results = await api.search(value, table);
        onSearch(results);
      } catch {
        // ignore search errors
      }
    }
  }, [onSearch, table]);

  const toggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  return (
    <>
      <div className="toolbar">
        <button
          className={`filter-btn${showFilters || activeCount > 0 ? " active" : ""}`}
          onClick={toggleFilters}
        >
          <span>Filter</span>
          {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
        </button>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>
      {showFilters && (
        <FilterPanel
          columns={columns}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      )}
    </>
  );
}
