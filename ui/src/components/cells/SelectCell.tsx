import type { RecordValue } from "../../types";

const TAG_COLORS = ["blue", "green", "orange", "purple", "yellow", "red", "gray"] as const;

// Track value-to-color mapping per table-column
const colorMaps = new Map<string, Map<string, string>>();

export function getSelectColor(table: string, column: string, value: string): string {
  const key = `${table}:${column}`;
  if (!colorMaps.has(key)) colorMaps.set(key, new Map());
  const map = colorMaps.get(key)!;
  if (!map.has(value)) {
    const idx = map.size % TAG_COLORS.length;
    map.set(value, TAG_COLORS[idx]!);
  }
  return map.get(value)!;
}

export function resetSelectColors() {
  colorMaps.clear();
}

interface SelectCellProps {
  value: RecordValue;
  table: string;
  column: string;
}

export function SelectCell({ value, table, column }: SelectCellProps) {
  if (value === null || value === undefined || value === "") {
    return <span className="cell-empty">—</span>;
  }

  const str = String(value);
  const color = getSelectColor(table, column, str);

  return <span className={`tag tag-${color}`}>{str}</span>;
}
