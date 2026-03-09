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
  onRenameColumn?: (oldName: string, newName: string) => void;
  onSetColumnAlias?: (column: string, alias: string | null) => void;
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

function ColumnMenu({
  col,
  onSelectDisplayType,
  onRename,
  onSetAlias,
  onClose,
}: {
  col: ColumnDef;
  onSelectDisplayType: (displayType: string | null) => void;
  onRename?: (newName: string) => void;
  onSetAlias?: (alias: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nameVal, setNameVal] = useState(col.name);
  const [aliasVal, setAliasVal] = useState(col.alias || "");

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

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRename && nameVal.trim() && nameVal !== col.name) {
      onRename(nameVal.trim());
    }
    if (onSetAlias) {
      const newAlias = aliasVal.trim() || null;
      if (newAlias !== (col.alias || null)) {
        onSetAlias(newAlias);
      }
    }
    onClose();
  };

  return (
    <div ref={ref} className="column-menu" onClick={(e) => e.stopPropagation()}>
      <div className="column-menu-section">
        <label className="column-menu-label">Column</label>
        <input
          className="column-menu-input"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave(e as unknown as React.MouseEvent)}
        />
      </div>
      <div className="column-menu-section">
        <label className="column-menu-label">Alias</label>
        <input
          className="column-menu-input"
          value={aliasVal}
          onChange={(e) => setAliasVal(e.target.value)}
          placeholder="Display name"
          onKeyDown={(e) => e.key === "Enter" && handleSave(e as unknown as React.MouseEvent)}
        />
      </div>
      {options.length > 0 && (
        <div className="column-menu-section">
          <label className="column-menu-label">Display Type</label>
          {options.map((opt) => {
            const isActive = opt.value === (col.displayType || "");
            return (
              <div
                key={opt.value}
                className={`display-type-option${isActive ? " active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDisplayType(opt.value || null);
                }}
              >
                {opt.label}
                {isActive && <span className="check">✓</span>}
              </div>
            );
          })}
        </div>
      )}
      <div className="column-menu-actions">
        <button className="btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save</button>
      </div>
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
  onRenameColumn,
  onSetColumnAlias,
}: RecordTableProps) {
  const [menuCol, setMenuCol] = useState<string | null>(null);

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
              const isUserCol = col.type !== "id" && col.type !== "auto";
              const hasPickerOptions = !isRelation && (DISPLAY_TYPE_OPTIONS[col.type]?.length ?? 0) > 0;
              const canOpenMenu = isUserCol && (hasPickerOptions || onRenameColumn || onSetColumnAlias);

              const typeLabel =
                col.type === "id" || col.type === "auto"
                  ? ""
                  : isRelation
                    ? `→ ${col.relationTarget || ""}`
                    : col.displayType
                      ? `${col.type}/${col.displayType}`
                      : col.type;

              const displayName = col.alias || col.name;

              return (
                <th
                  key={col.name}
                  className={className}
                  onClick={() => onSort(col.name)}
                >
                  {displayName}
                  {typeLabel && (
                    <span
                      className={`col-type${canOpenMenu ? " col-type-editable" : ""}`}
                      onClick={(e) => {
                        if (canOpenMenu) {
                          e.stopPropagation();
                          setMenuCol(menuCol === col.name ? null : col.name);
                        }
                      }}
                    >
                      {typeLabel}
                    </span>
                  )}
                  <span className="sort-icon">{sortDir}</span>
                  {menuCol === col.name && (
                    <ColumnMenu
                      col={col}
                      onSelectDisplayType={(dt) => onModifyColumn?.(col.name, dt)}
                      onRename={onRenameColumn ? (newName) => onRenameColumn(col.name, newName) : undefined}
                      onSetAlias={onSetColumnAlias ? (alias) => onSetColumnAlias(col.name, alias) : undefined}
                      onClose={() => setMenuCol(null)}
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
