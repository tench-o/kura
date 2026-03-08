import type { RecordValue } from "../../types";

interface RelationCellProps {
  value: RecordValue;
  target?: string;
  onNavigate?: (table: string) => void;
}

export function RelationCell({ value, target, onNavigate }: RelationCellProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="cell-empty">—</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    if (target && onNavigate) {
      e.stopPropagation();
      onNavigate(target);
    }
  };

  // For relation[], value is comma-separated display values
  const displayValue = String(value);
  if (displayValue.includes(", ")) {
    return (
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {displayValue.split(", ").map((v, i) => (
          <span key={i} className="cell-relation" onClick={handleClick}>
            {v}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="cell-relation" onClick={handleClick}>
      {displayValue}
    </span>
  );
}
