import { useState } from "react";
import { api } from "../api/client";
import type { ColumnDef } from "../types";

interface TopbarProps {
  tableName: string;
  onNewRecord: () => void;
  onDeleteTable: () => void;
  onAddColumn: () => void;
  columns: ColumnDef[];
}

export function Topbar({ tableName, onNewRecord, onDeleteTable, onAddColumn, columns: _columns }: TopbarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [colDef, setColDef] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteTable = async () => {
    try {
      await api.deleteTable(tableName);
      onDeleteTable();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete table");
    }
    setConfirmDelete(false);
    setShowMenu(false);
  };

  const handleAddColumn = async () => {
    if (!colDef.trim()) return;
    try {
      await api.addColumn(tableName, colDef.trim());
      setColDef("");
      setShowAddCol(false);
      onAddColumn();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add column");
    }
  };

  return (
    <div className="topbar">
      <div className="topbar-title">
        <span className="table-icon">📋</span>
        <span>{tableName}</span>
      </div>
      <div className="topbar-sep" />
      <div className="topbar-actions" style={{ position: "relative" }}>
        <button className="btn" onClick={() => setShowMenu(!showMenu)}>
          ···
        </button>
        {showMenu && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 60,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow)",
              zIndex: 50,
              minWidth: 160,
              padding: "4px 0",
            }}
          >
            <div
              className="sidebar-item"
              onClick={() => { setShowAddCol(true); setShowMenu(false); }}
            >
              Add Column
            </div>
            <div
              className="sidebar-item"
              style={{ color: "var(--tag-red-text)" }}
              onClick={() => { setConfirmDelete(true); setShowMenu(false); }}
            >
              Delete Table
            </div>
          </div>
        )}
        <button className="btn btn-primary" onClick={onNewRecord}>
          + New
        </button>
      </div>

      {showAddCol && (
        <div className="form-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddCol(false)}>
          <div className="form-modal">
            <h2>Add Column</h2>
            <div className="form-group">
              <label>Column definition (e.g. email:text, budget:int, team:relation(teams))</label>
              <input
                value={colDef}
                onChange={(e) => setColDef(e.target.value)}
                placeholder="name:type"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
            </div>
            <div className="form-actions">
              <button className="btn" onClick={() => setShowAddCol(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddColumn}>Add</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(false)}>
          <div className="confirm-dialog">
            <h3>Delete Table</h3>
            <p>Are you sure you want to delete "{tableName}"? This cannot be undone.</p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteTable}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
