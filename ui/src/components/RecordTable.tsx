import { useState, useRef, useEffect } from "react";
import type { KuraRecord, ColumnDef } from "../types";
import { TextCell } from "./cells/TextCell";
import { NumberCell } from "./cells/NumberCell";
import { BoolCell } from "./cells/BoolCell";
import { RelationCell } from "./cells/RelationCell";
import { SelectCell } from "./cells/SelectCell";

interface RecordTableProps {
  records: KuraRecord[];
  columns: ColumnDef[];
  sort?: string;
  onSort: (column: string) => void;
  onRecordClick: (id: number) => void;
  onNewRecord: () => void;
  onNavigateTable: (table: string) => void;
  onModifyColumn?: (column: string, displayType: string | null) => void;
}

const AUTO_COLUMNS = ["created_at", "updated_at"];

const DISPLAY_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  text: [
    { label: "text (default)", value: "" },
    { label: "select", value: "select" },
    { label: "multiline", value: "multiline" },
    { label: "url", value: "url" },
    { label: "email", value: "email" },
    { label: "date", value: "date" },
    { label: "phone", value: "phone" },
  ],
  int: [
    { label: "number (default)", value: "" },
    { label: "currency", value: "currency" },
    { label: "rating", value: "rating" },
  ],
  real: [
    { label: "number (default)", value: "" },
    { label: "percent", value: "percent" },
  ],
  bool: [],
};

function DisplayTypePicker({
  col,
  onSelect,
  onClose,
}: {
  col: ColumnDef;
  onSelect: (displayType: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const options = DISPLAY_TYPE_OPTIONS[col.type] || [];
  if (options.length === 0) return null;

  return (
    <div ref={ref} className="display-type-picker">
      {options.map((opt) => {
        const isActive = opt.value === (col.displayType || "");
        return (
          <div
            key={opt.value}
            className={`display-type-option${isActive ? " active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt.value || null);
              onClose();
            }}
          >
            {opt.label}
            {isActive && <span className="check">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function renderCell(
  record: KuraRecord,
  col: ColumnDef,
  tableName: string,
  onNavigateTable: (table: string) => void,
) {
  const value = record.data[col.name] ?? null;

  if (col.displayType === "select") {
    return <SelectCell value={value} table={tableName} column={col.name} />;
  }

  switch (col.type) {
    case "text":
      return <TextCell value={value} displayType={col.displayType} />;
    case "int":
    case "real":
      return <NumberCell value={value} displayType={col.displayType} type={col.type as "int" | "real"} />;
    case "bool":
      return <BoolCell value={value} />;
    case "relation":
    case "relation[]":
      return <RelationCell value={value} target={col.relationTarget} onNavigate={onNavigateTable} />;
    default:
      return <>{value != null ? String(value) : <span className="cell-empty">—</span>}</>;
  }
}

export function RecordTable({
  records,
  columns,
  sort,
  onSort,
  onRecordClick,
  onNewRecord,
  onNavigateTable,
  onModifyColumn,
}: RecordTableProps) {
  const [pickerCol, setPickerCol] = useState<string | null>(null);

  // Build all visible columns: id + user columns + timestamps
  const allColumns = [
    { name: "id", type: "id", position: -1 } as ColumnDef,
    ...columns,
    { name: "created_at", type: "auto", position: 998 } as ColumnDef,
    { name: "updated_at", type: "auto", position: 999 } as ColumnDef,
  ];

  const tableName = columns[0] ? "" : ""; // We'll derive from context

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {allColumns.map((col) => {
              const isAuto = AUTO_COLUMNS.includes(col.name);
              const isSorted = sort === col.name || sort === `-${col.name}`;
              const sortDir = sort === `-${col.name}` ? "↓" : sort === col.name ? "↑" : "↕";
              const className = [
                col.name === "id" ? "col-id" : "",
                isAuto ? "col-auto" : "",
                isSorted ? "sorted" : "",
              ].filter(Boolean).join(" ");

              const isRelation = col.type === "relation" || col.type === "relation[]";
              const hasPickerOptions = !isRelation && (DISPLAY_TYPE_OPTIONS[col.type]?.length ?? 0) > 0;

              const typeLabel =
                col.type === "id" || col.type === "auto"
                  ? ""
                  : isRelation
                    ? `→ ${col.relationTarget || ""}`
                    : col.displayType
                      ? `${col.type}/${col.displayType}`
                      : col.type;

              return (
                <th
                  key={col.name}
                  className={className}
                  onClick={() => onSort(col.name)}
                >
                  {col.name}
                  {typeLabel && (
                    <span
                      className={`col-type${hasPickerOptions && onModifyColumn ? " col-type-editable" : ""}`}
                      onClick={(e) => {
                        if (hasPickerOptions && onModifyColumn) {
                          e.stopPropagation();
                          setPickerCol(pickerCol === col.name ? null : col.name);
                        }
                      }}
                    >
                      {typeLabel}
                    </span>
                  )}
                  <span className="sort-icon">{sortDir}</span>
                  {pickerCol === col.name && onModifyColumn && (
                    <DisplayTypePicker
                      col={col}
                      onSelect={(dt) => onModifyColumn(col.name, dt)}
                      onClose={() => setPickerCol(null)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} onClick={() => onRecordClick(record.id)}>
              <td className="col-id">{record.id}</td>
              {columns.map((col) => (
                <td key={col.name}>
                  {renderCell(record, col, tableName, onNavigateTable)}
                </td>
              ))}
              <td className="col-auto">{record.created_at}</td>
              <td className="col-auto">{record.updated_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="new-row" onClick={onNewRecord}>
        + New
      </div>
    </div>
  );
}
