import { useCallback, useMemo } from "react";
import type { ColumnDef, FilterCondition, FilterOperator, DateSpecialOperator, DateFilterOperator } from "../types";
import { OPERATORS_BY_TYPE, DATE_SPECIAL_OPERATORS } from "../types";

interface FilterPanelProps {
  columns: ColumnDef[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
}

const TEXT_OPERATORS = OPERATORS_BY_TYPE.text!;

function isDateColumn(col: ColumnDef): boolean {
  return col.type === "text" && col.displayType === "date";
}

function getOperatorsForColumn(col: ColumnDef): { value: DateFilterOperator; label: string }[] {
  if (isDateColumn(col)) return OPERATORS_BY_TYPE.date!;
  return OPERATORS_BY_TYPE[col.type] ?? TEXT_OPERATORS;
}

const NO_VALUE_OPERATORS = new Set<string>([
  "is_empty", "is_not_empty", "this_week", "this_month", "last_month", "next_month",
]);

function getMonthRange(year: number, month: number): [string, string] {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [start, end];
}

function getWeekRange(today: Date): [string, string] {
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [fmt(monday), fmt(sunday)];
}

function computeDateHint(operator: string): string | null {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  switch (operator) {
    case "this_month": {
      const [s, e] = getMonthRange(year, month);
      return `${s} 〜 ${e}`;
    }
    case "last_month": {
      const lm = month === 1 ? 12 : month - 1;
      const ly = month === 1 ? year - 1 : year;
      const [s, e] = getMonthRange(ly, lm);
      return `${s} 〜 ${e}`;
    }
    case "next_month": {
      const nm = month === 12 ? 1 : month + 1;
      const ny = month === 12 ? year + 1 : year;
      const [s, e] = getMonthRange(ny, nm);
      return `${s} 〜 ${e}`;
    }
    case "this_week": {
      const [s, e] = getWeekRange(today);
      return `${s} 〜 ${e}`;
    }
    default:
      return null;
  }
}

export function FilterPanel({ columns, filters, onFiltersChange }: FilterPanelProps) {
  const addFilter = useCallback(() => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const ops = getOperatorsForColumn(firstCol);
    const defaultOp = ops[0]?.value ?? ("eq" as FilterOperator);
    onFiltersChange([
      ...filters,
      {
        id: crypto.randomUUID(),
        column: firstCol.name,
        operator: defaultOp,
        value: "",
      },
    ]);
  }, [columns, filters, onFiltersChange]);

  const updateFilter = useCallback(
    (id: string, patch: Partial<FilterCondition>) => {
      onFiltersChange(
        filters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [filters, onFiltersChange],
  );

  const removeFilter = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id));
    },
    [filters, onFiltersChange],
  );

  const handleColumnChange = useCallback(
    (id: string, columnName: string) => {
      const col = columns.find((c) => c.name === columnName);
      if (!col) return;
      const ops = getOperatorsForColumn(col);
      const defaultOp = ops[0]?.value ?? ("eq" as FilterOperator);
      updateFilter(id, { column: columnName, operator: defaultOp, value: "", valueEnd: undefined });
    },
    [columns, updateFilter],
  );

  const handleOperatorChange = useCallback(
    (id: string, operator: DateFilterOperator) => {
      const patch: Partial<FilterCondition> = { operator };
      if (NO_VALUE_OPERATORS.has(operator)) {
        patch.value = "";
        patch.valueEnd = undefined;
      }
      if (operator !== "between") {
        patch.valueEnd = undefined;
      }
      updateFilter(id, patch);
    },
    [updateFilter],
  );

  // Precompute date hints for relative operators
  const dateHints = useMemo(() => {
    const hints: Record<string, string | null> = {};
    for (const f of filters) {
      if (DATE_SPECIAL_OPERATORS.includes(f.operator as DateSpecialOperator) && f.operator !== "between") {
        hints[f.id] = computeDateHint(f.operator);
      }
    }
    return hints;
  }, [filters]);

  return (
    <div className="filter-panel">
      {filters.map((filter) => {
        const col = columns.find((c) => c.name === filter.column);
        const ops = col ? getOperatorsForColumn(col) : TEXT_OPERATORS;
        const hideValue = NO_VALUE_OPERATORS.has(filter.operator);
        const isDate = col ? isDateColumn(col) : false;
        const isBetween = filter.operator === "between";
        const hint = dateHints[filter.id];

        return (
          <div key={filter.id} className="filter-row">
            <span className="filter-label">Where</span>
            <select
              className="filter-select"
              value={filter.column}
              onChange={(e) => handleColumnChange(filter.id, e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filter.operator}
              onChange={(e) =>
                handleOperatorChange(filter.id, e.target.value as DateFilterOperator)
              }
            >
              {ops.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {!hideValue && !isBetween && (
              <input
                className={isDate ? "filter-date-input" : "filter-input"}
                type={isDate ? "date" : "text"}
                placeholder={isDate ? "" : "Value..."}
                value={filter.value}
                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
              />
            )}
            {isBetween && (
              <div className="filter-date-range">
                <input
                  className="filter-date-input"
                  type="date"
                  value={filter.value}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                />
                <span className="filter-date-separator">〜</span>
                <input
                  className="filter-date-input"
                  type="date"
                  value={filter.valueEnd ?? ""}
                  onChange={(e) => updateFilter(filter.id, { valueEnd: e.target.value })}
                />
              </div>
            )}
            {hint && (
              <span className="filter-date-hint">{hint}</span>
            )}
            <button
              className="filter-remove"
              onClick={() => removeFilter(filter.id)}
              title="Remove filter"
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="filter-add" onClick={addFilter}>
        + Add filter
      </button>
    </div>
  );
}
