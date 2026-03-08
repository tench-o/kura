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
}

const AUTO_COLUMNS = ["id", "created_at", "updated_at"];

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
}: RecordTableProps) {
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
                isAuto && col.name !== "id" ? "col-auto" : "",
                isSorted ? "sorted" : "",
              ].filter(Boolean).join(" ");

              const typeLabel =
                col.type === "id" || col.type === "auto"
                  ? ""
                  : col.type === "relation" || col.type === "relation[]"
                    ? `→ ${col.relationTarget || ""}`
                    : col.displayType
                      ? `${col.type}/${col.displayType}`
                      : col.type;

              return (
                <th
                  key={col.name}
                  className={className}
                  onClick={() => !isAuto && col.name !== "id" && onSort(col.name)}
                >
                  {col.name}
                  {typeLabel && <span className="col-type">{typeLabel}</span>}
                  {!isAuto && col.name !== "id" && (
                    <span className="sort-icon">{sortDir}</span>
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
