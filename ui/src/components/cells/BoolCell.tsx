import type { RecordValue } from "../../types";

interface BoolCellProps {
  value: RecordValue;
}

export function BoolCell({ value }: BoolCellProps) {
  const checked = value === 1 || value === true || value === "true";
  return (
    <span className="cell-bool">
      <input type="checkbox" checked={checked} readOnly onClick={(e) => e.stopPropagation()} />
    </span>
  );
}
