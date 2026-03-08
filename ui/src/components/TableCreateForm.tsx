import { useState } from "react";
import { api } from "../api/client";

interface TableCreateFormProps {
  onClose: () => void;
  onCreated: (name: string) => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

interface ColumnRow {
  name: string;
  type: string;
  display: string;
  relationTarget: string;
}

const TYPES = ["text", "int", "real", "bool", "relation", "relation[]"];
const DISPLAY_TYPES: Record<string, string[]> = {
  text: ["", "multiline", "url", "email", "select", "date", "phone"],
  int: ["", "currency", "rating"],
  real: ["", "percent"],
};

function emptyColumn(): ColumnRow {
  return { name: "", type: "text", display: "", relationTarget: "" };
}

export function TableCreateForm({ onClose, onCreated, showToast }: TableCreateFormProps) {
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnRow[]>([emptyColumn()]);

  const updateColumn = (index: number, updates: Partial<ColumnRow>) => {
    setColumns(columns.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  };

  const removeColumn = (index: number) => {
    if (columns.length <= 1) return;
    setColumns(columns.filter((_, i) => i !== index));
  };

  const addColumn = () => {
    setColumns([...columns, emptyColumn()]);
  };

  const handleSubmit = async () => {
    if (!tableName.trim()) {
      showToast("Table name is required", "error");
      return;
    }

    const colDefs: string[] = [];
    for (const col of columns) {
      if (!col.name.trim()) continue;
      if (col.type === "relation" || col.type === "relation[]") {
        if (!col.relationTarget.trim()) {
          showToast(`Relation target required for "${col.name}"`, "error");
          return;
        }
        colDefs.push(`${col.name}:${col.type}(${col.relationTarget})`);
      } else if (col.display) {
        colDefs.push(`${col.name}:${col.type}/${col.display}`);
      } else {
        colDefs.push(`${col.name}:${col.type}`);
      }
    }

    if (colDefs.length === 0) {
      showToast("At least one column is required", "error");
      return;
    }

    try {
      await api.createTable(tableName.trim(), colDefs);
      onCreated(tableName.trim());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create table", "error");
    }
  };

  return (
    <div className="form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="form-modal">
        <h2>Create Table</h2>

        <div className="form-group">
          <label>Table Name</label>
          <input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g. users, projects"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Columns</label>
          {columns.map((col, i) => (
            <div className="col-def-row" key={i}>
              <input
                placeholder="name"
                value={col.name}
                onChange={(e) => updateColumn(i, { name: e.target.value })}
                style={{ flex: 1 }}
              />
              <select
                value={col.type}
                onChange={(e) => updateColumn(i, { type: e.target.value, display: "", relationTarget: "" })}
                style={{ width: 120 }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {(col.type === "relation" || col.type === "relation[]") && (
                <input
                  placeholder="target table"
                  value={col.relationTarget}
                  onChange={(e) => updateColumn(i, { relationTarget: e.target.value })}
                  style={{ width: 120 }}
                />
              )}
              {DISPLAY_TYPES[col.type] && DISPLAY_TYPES[col.type]!.length > 1 && (
                <select
                  value={col.display}
                  onChange={(e) => updateColumn(i, { display: e.target.value })}
                  style={{ width: 100 }}
                >
                  {DISPLAY_TYPES[col.type]!.map((d) => (
                    <option key={d} value={d}>
                      {d || "(default)"}
                    </option>
                  ))}
                </select>
              )}
              <button className="remove-btn" onClick={() => removeColumn(i)}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn" onClick={addColumn} style={{ marginTop: 4 }}>
            + Add Column
          </button>
        </div>

        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Create Table
          </button>
        </div>
      </div>
    </div>
  );
}
