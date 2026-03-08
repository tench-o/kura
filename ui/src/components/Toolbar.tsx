import { useState, useCallback } from "react";
import { api } from "../api/client";
import type { SearchResult } from "../types";

interface ToolbarProps {
  onSearch: (results: SearchResult[] | null) => void;
  table: string;
  sort?: string;
}

export function Toolbar({ onSearch, table, sort: _sort }: ToolbarProps) {
  const [query, setQuery] = useState("");

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

  return (
    <div className="toolbar">
      <div className="search-box">
        <input
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
    </div>
  );
}
