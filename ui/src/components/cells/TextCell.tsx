import type { RecordValue } from "../../types";

interface TextCellProps {
  value: RecordValue;
  displayType?: string;
}

export function TextCell({ value, displayType }: TextCellProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="cell-empty">—</span>;
  }

  const str = String(value);

  if (displayType === "url") {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--accent)", textDecoration: "none" }}
      >
        {str}
      </a>
    );
  }

  if (displayType === "email") {
    return (
      <a
        href={`mailto:${str}`}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--accent)", textDecoration: "none" }}
      >
        {str}
      </a>
    );
  }

  return <>{str}</>;
}
