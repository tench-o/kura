import { useState } from "react";
import { api } from "../api/client";
import type { ColumnDef, KuraRecord, RecordData } from "../types";

interface RecordFormProps {
  table: string;
  columns: ColumnDef[];
  rawRecords: KuraRecord[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function RecordForm({ table, columns, rawRecords: _rawRecords, onClose, onSaved, showToast }: RecordFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const data: RecordData = {};
    for (const col of columns) {
      const val = values[col.name];
      if (val === undefined || val === "") continue;

      if (col.type === "int" || col.type === "relation") {
        data[col.name] = parseInt(val, 10);
      } else if (col.type === "real") {
        data[col.name] = parseFloat(val);
      } else if (col.type === "bool") {
        data[col.name] = val === "true" || val === "1" ? 1 : 0;
      } else {
        data[col.name] = val;
      }
    }

    try {
      await api.addRecord(table, data);
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add record", "error");
    }
  };

  return (
    <div className="form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="form-modal">
        <h2>New Record</h2>
        {columns.map((col) => (
          <div className="form-group" key={col.name}>
            <label>
              {col.name}{" "}
              <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                ({col.type}{col.relationTarget ? `→${col.relationTarget}` : ""})
              </span>
            </label>
            {col.type === "bool" ? (
              <select
                value={values[col.name] || "0"}
                onChange={(e) => setValues({ ...values, [col.name]: e.target.value })}
              >
                <option value="0">false</option>
                <option value="1">true</option>
              </select>
            ) : (
              <input
                type={
                  col.type === "int" || col.type === "real" || col.type === "relation"
                    ? "number"
                    : "text"
                }
                value={values[col.name] || ""}
                onChange={(e) => setValues({ ...values, [col.name]: e.target.value })}
                placeholder={
                  col.type === "relation"
                    ? `ID from ${col.relationTarget}`
                    : col.type === "relation[]"
                      ? "Comma-separated IDs (e.g. 1,2,3)"
                      : undefined
                }
              />
            )}
          </div>
        ))}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Add Record
          </button>
        </div>
      </div>
    </div>
  );
}
