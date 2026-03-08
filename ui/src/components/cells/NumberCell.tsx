import type { RecordValue } from "../../types";

interface NumberCellProps {
  value: RecordValue;
  displayType?: string;
  type: "int" | "real";
}

export function NumberCell({ value, displayType, type: _type }: NumberCellProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="cell-empty">—</span>;
  }

  const num = Number(value);

  if (displayType === "currency") {
    return <span className="cell-int">{"¥" + num.toLocaleString()}</span>;
  }

  if (displayType === "rating") {
    const stars = Math.min(5, Math.max(0, Math.round(num)));
    return (
      <span>
        {"★".repeat(stars)}{"☆".repeat(5 - stars)}
      </span>
    );
  }

  if (displayType === "percent") {
    return <span className="cell-real">{num}%</span>;
  }

  return <span className="cell-int">{value}</span>;
}
