import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { ColumnDef, KuraRecord, RecordData, RecordValue } from "../types";
import { TextCell } from "./cells/TextCell";
import { NumberCell } from "./cells/NumberCell";
import { BoolCell } from "./cells/BoolCell";
import { RelationCell } from "./cells/RelationCell";
import { SelectCell } from "./cells/SelectCell";

interface RecordModalProps {
  table: string;
  recordId: number;
  columns: ColumnDef[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onNavigateTable: (table: string) => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

const PROP_ICONS: Record<string, string> = {
  text: "Aa",
  int: "#",
  real: "#.#",
  bool: "☑",
  relation: "↗",
  "relation[]": "↗",
  select: "◉",
  url: "🔗",
  email: "✉",
  date: "📅",
  rating: "⭐",
  currency: "💰",
  percent: "%",
};

export function RecordModal({
  table,
  recordId,
  columns,
  onClose,
  onSaved,
  onDeleted,
  onNavigateTable,
  showToast,
}: RecordModalProps) {
  const [record, setRecord] = useState<KuraRecord | null>(null);
  const [rawRecord, setRawRecord] = useState<KuraRecord | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getRecord(table, recordId);
        setRecord(data.record);
        setRawRecord(data.rawRecord);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to load record", "error");
        onClose();
      }
    };
    load();
  }, [table, recordId, onClose, showToast]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (editingField) {
        setEditingField(null);
      } else if (confirmDelete) {
        setConfirmDelete(false);
      } else {
        onClose();
      }
    }
  }, [editingField, confirmDelete, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const startEdit = (colName: string, value: RecordValue) => {
    setEditingField(colName);
    setEditValue(value != null ? String(value) : "");
  };

  const saveEdit = async (colName: string) => {
    if (!rawRecord) return;
    setEditingField(null);

    const col = columns.find((c) => c.name === colName);
    if (!col) return;

    let newValue: RecordValue = editValue;
    if (col.type === "int" || col.type === "relation") {
      newValue = editValue ? parseInt(editValue, 10) : null;
    } else if (col.type === "real") {
      newValue = editValue ? parseFloat(editValue) : null;
    } else if (col.type === "bool") {
      newValue = editValue === "true" || editValue === "1" ? 1 : 0;
    }

    // Skip if unchanged
    if (rawRecord.data[colName] === newValue) return;

    try {
      const data: RecordData = { [colName]: newValue };
      await api.updateRecord(table, recordId, data);
      const updated = await api.getRecord(table, recordId);
      setRecord(updated.record);
      setRawRecord(updated.rawRecord);
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteRecord(table, recordId);
      onDeleted();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete", "error");
    }
  };

  if (!record || !rawRecord) return null;

  // First text column is the title
  const titleCol = columns.find((c) => c.type === "text");
  const titleValue = titleCol ? record.data[titleCol.name] : null;
  const otherColumns = columns.filter((c) => c !== titleCol);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="record-id">#{record.id}</span>
          {titleCol && editingField === titleCol.name ? (
            <input
              className="modal-title modal-edit-input"
              style={{ fontSize: 24, fontWeight: 700 }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveEdit(titleCol.name)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit(titleCol.name)}
              autoFocus
            />
          ) : (
            <div
              className="modal-title"
              onClick={() => titleCol && startEdit(titleCol.name, rawRecord.data[titleCol.name] ?? null)}
            >
              {titleValue || <span style={{ color: "var(--text-tertiary)" }}>Untitled</span>}
            </div>
          )}
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-props">
          {otherColumns.map((col) => {
            const icon =
              PROP_ICONS[col.displayType || ""] || PROP_ICONS[col.type] || "·";
            const displayValue = record.data[col.name] ?? null;
            const rawValue = rawRecord.data[col.name] ?? null;
            const isEditing = editingField === col.name;

            return (
              <div className="modal-prop" key={col.name}>
                <div className="modal-prop-label">
                  <span className="prop-icon">{icon}</span> {col.name}
                </div>
                <div
                  className="modal-prop-value"
                  onClick={() => !isEditing && startEdit(col.name, rawValue)}
                >
                  {isEditing ? (
                    col.type === "bool" ? (
                      <select
                        className="modal-edit-select"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(col.name)}
                        autoFocus
                      >
                        <option value="1">true</option>
                        <option value="0">false</option>
                      </select>
                    ) : (
                      <input
                        className="modal-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveEdit(col.name)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(col.name)}
                        autoFocus
                        type={
                          col.type === "int" || col.type === "real" || col.type === "relation"
                            ? "number"
                            : "text"
                        }
                      />
                    )
                  ) : (
                    renderPropValue(col, displayValue, table, onNavigateTable)
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>

        <div className="modal-timestamps">
          <span>Created: {record.created_at}</span>
          <span>Updated: {record.updated_at}</span>
        </div>
      </div>

      {confirmDelete && (
        <div
          className="confirm-overlay"
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(false)}
        >
          <div className="confirm-dialog">
            <h3>Delete Record</h3>
            <p>Are you sure you want to delete record #{recordId}?</p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPropValue(
  col: ColumnDef,
  value: RecordValue,
  table: string,
  onNavigateTable: (table: string) => void,
) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "var(--text-tertiary)" }}>Empty</span>;
  }

  if (col.displayType === "select") {
    return <SelectCell value={value} table={table} column={col.name} />;
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
      return <>{String(value)}</>;
  }
}
