import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api/client";
import type { KuraRecord } from "../../types";

interface RelationInputProps {
  targetTable: string;
  displayColumn?: string;
  value: number | null;
  onChange: (id: number | null) => void;
}

export function RelationInput({ targetTable, displayColumn, value, onChange }: RelationInputProps) {
  const [displayName, setDisplayName] = useState<string>("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KuraRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [resolvedDisplayCol, setResolvedDisplayCol] = useState<string | null>(displayColumn || null);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Resolve display column if not provided
  useEffect(() => {
    if (displayColumn) {
      setResolvedDisplayCol(displayColumn);
      return;
    }
    api.describeTable(targetTable).then((info: { columns: { type: string; name: string }[] }) => {
      const textCol = info.columns.find((c: { type: string }) => c.type === "text");
      setResolvedDisplayCol(textCol?.name || null);
    }).catch(() => {});
  }, [targetTable, displayColumn]);

  // Resolve current value display
  useEffect(() => {
    if (value === null || !resolvedDisplayCol) {
      setDisplayName("");
      return;
    }
    api.getRecord(targetTable, value).then((data) => {
      const col = resolvedDisplayCol;
      const v = data.record.data[col];
      setDisplayName(v != null ? String(v) : `#${value}`);
    }).catch(() => {
      setDisplayName(`#${value}`);
    });
  }, [targetTable, value, resolvedDisplayCol]);

  // Search records
  const searchRecords = useCallback((q: string) => {
    const filters = q && resolvedDisplayCol
      ? [{ id: "_search", column: resolvedDisplayCol, operator: "contains" as const, value: q }]
      : undefined;
    api.listRecords(targetTable, { limit: 10, filters }).then((data) => {
      setOptions(data.records);
    }).catch(() => {});
  }, [targetTable, resolvedDisplayCol]);

  // Click outside handler
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchRecords(val), 300);
  };

  const handleFocus = () => {
    setOpen(true);
    searchRecords(query);
  };

  const handleSelect = (rec: KuraRecord) => {
    onChange(rec.id);
    const col = resolvedDisplayCol;
    const v = col ? rec.data[col] : null;
    setDisplayName(v != null ? String(v) : `#${rec.id}`);
    setQuery("");
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setDisplayName("");
    setQuery("");
  };

  const col = resolvedDisplayCol;

  return (
    <div className="relation-input" ref={ref}>
      {!open ? (
        <div className="relation-input-display" onClick={handleFocus}>
          {displayName ? (
            <>
              <span>{displayName}</span>
              <span className="relation-clear" onClick={handleClear}>&times;</span>
            </>
          ) : (
            <span style={{ color: "var(--text-tertiary)" }}>Select...</span>
          )}
        </div>
      ) : (
        <input
          className="relation-input-search"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search..."
          autoFocus
        />
      )}
      {open && (
        <div className="relation-dropdown">
          {options.map((rec) => {
            const label = col ? rec.data[col] : null;
            return (
              <div key={rec.id} className="relation-option" onClick={() => handleSelect(rec)}>
                {label != null ? String(label) : `Record`}
                <span className="relation-option-id">#{rec.id}</span>
              </div>
            );
          })}
          {options.length === 0 && (
            <div className="relation-option" style={{ color: "var(--text-tertiary)", cursor: "default" }}>
              No results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
