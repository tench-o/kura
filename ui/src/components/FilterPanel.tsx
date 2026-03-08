import { useCallback } from "react";
import type { ColumnDef, FilterCondition, FilterOperator } from "../types";
import { OPERATORS_BY_TYPE } from "../types";

interface FilterPanelProps {
  columns: ColumnDef[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
}

const TEXT_OPERATORS = OPERATORS_BY_TYPE.text!;

function getOperatorsForColumn(col: ColumnDef): { value: FilterOperator; label: string }[] {
  return OPERATORS_BY_TYPE[col.type] ?? TEXT_OPERATORS;
}

export function FilterPanel({ columns, filters, onFiltersChange }: FilterPanelProps) {
  const addFilter = useCallback(() => {
    const firstCol = columns[0];
    if (!firstCol) return;
    const ops = getOperatorsForColumn(firstCol);
    const defaultOp = ops[0]?.value ?? "eq" as FilterOperator;
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
      const defaultOp = ops[0]?.value ?? "eq" as FilterOperator;
      updateFilter(id, { column: columnName, operator: defaultOp, value: "" });
    },
    [columns, updateFilter],
  );

  const handleOperatorChange = useCallback(
    (id: string, operator: FilterOperator) => {
      const patch: Partial<FilterCondition> = { operator };
      if (operator === "is_empty" || operator === "is_not_empty") {
        patch.value = "";
      }
      updateFilter(id, patch);
    },
    [updateFilter],
  );

  return (
    <div className="filter-panel">
      {filters.map((filter) => {
        const col = columns.find((c) => c.name === filter.column);
        const ops = col ? getOperatorsForColumn(col) : TEXT_OPERATORS;
        const hideValue = filter.operator === "is_empty" || filter.operator === "is_not_empty";

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
                handleOperatorChange(filter.id, e.target.value as FilterOperator)
              }
            >
              {ops.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            {!hideValue && (
              <input
                className="filter-input"
                type="text"
                placeholder="Value..."
                value={filter.value}
                onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
              />
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
