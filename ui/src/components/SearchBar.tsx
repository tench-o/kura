import type { SearchResult } from "../types";

interface SearchResultsProps {
  results: SearchResult[];
  onResultClick: (table: string, id: number) => void;
  onClear: () => void;
}

export function SearchResults({ results, onResultClick, onClear }: SearchResultsProps) {
  return (
    <div className="table-container">
      <div className="search-results">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
          <button className="btn" onClick={onClear}>
            Clear
          </button>
        </div>
        {results.length === 0 ? (
          <div className="empty-state" style={{ height: "auto", paddingTop: 40 }}>
            <p>No results found</p>
          </div>
        ) : (
          results.map((r, i) => (
            <div
              key={`${r.table}-${r.id}-${i}`}
              className="search-result-item"
              onClick={() => onResultClick(r.table, r.id)}
            >
              <div className="result-table">
                {r.table} · #{r.id}
              </div>
              <div className="result-snippet">{r.snippet}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
