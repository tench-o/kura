import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api/client";
import type { KuraRecord } from "../../types";

interface RelationArrayInputProps {
  targetTable: string;
  displayColumn?: string;
  value: number[];
  onChange: (ids: number[]) => void;
}

interface ResolvedItem {
  id: number;
  label: string;
}

export function RelationArrayInput({ targetTable, displayColumn, value, onChange }: RelationArrayInputProps) {
  const [resolvedItems, setResolvedItems] = useState<ResolvedItem[]>([]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<KuraRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [resolvedDisplayCol, setResolvedDisplayCol] = useState<string | null>(displayColumn || null);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Resolve display column
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

  // Resolve current value items
  useEffect(() => {
    if (value.length === 0 || !resolvedDisplayCol) {
      setResolvedItems([]);
      return;
    }
    Promise.all(
      value.map((id) =>
        api.getRecord(targetTable, id).then((data) => {
          const col = resolvedDisplayCol;
          const v = col ? data.record.data[col] : null;
          return { id, label: v != null ? String(v) : `#${id}` };
        }).catch(() => ({ id, label: `#${id}` }))
      ),
    ).then(setResolvedItems);
  }, [targetTable, value, resolvedDisplayCol]);

  // Search records
  const searchRecords = useCallback((q: string) => {
    const filters = q && resolvedDisplayCol
      ? [{ id: "_search", column: resolvedDisplayCol, operator: "contains" as const, value: q }]
      : undefined;
    api.listRecords(targetTable, { limit: 10, filters }).then((data) => {
      setOptions(data.records.filter((r) => !value.includes(r.id)));
    }).catch(() => {});
  }, [targetTable, resolvedDisplayCol, value]);

  // Click outside
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
    onChange([...value, rec.id]);
    setQuery("");
    searchRecords("");
  };

  const handleRemove = (id: number) => {
    onChange(value.filter((v) => v !== id));
  };

  const col = resolvedDisplayCol;

  return (
    <div className="relation-input" ref={ref}>
      <div className="relation-tags">
        {resolvedItems.map((item) => (
          <span key={item.id} className="relation-tag">
            {item.label}
            <span className="relation-tag-remove" onClick={() => handleRemove(item.id)}>&times;</span>
          </span>
        ))}
      </div>
      <input
        className="relation-input-search"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        placeholder="Search to add..."
      />
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
