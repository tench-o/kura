import { useState, useEffect } from "react";
import { api } from "../api/client";

interface TableSettingsModalProps {
  tableName: string;
  currentAlias?: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function TableSettingsModal({
  tableName,
  currentAlias,
  onClose,
  onSaved,
  showToast,
}: TableSettingsModalProps) {
  const [alias, setAlias] = useState(currentAlias || "");
  const [aiContext, setAiContext] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const ctx = await api.getAiContext(tableName);
        const tableCtx = ctx.tables?.find((t) => t.name === tableName);
        setAiContext(tableCtx?.aiContext || "");
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tableName]);

  const handleSave = async () => {
    try {
      await api.setTableAlias(tableName, alias.trim() || null);

      if (aiContext.trim()) {
        await api.setAiContext(tableName, aiContext.trim());
      } else {
        await api.clearAiContext(tableName);
      }

      onSaved();
      onClose();
      showToast("Table settings saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  };

  return (
    <div className="form-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="form-modal">
        <h2>Table Settings: {tableName}</h2>

        {loading ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading...</p>
        ) : (
          <>
            <div className="form-group">
              <label>Alias</label>
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Human-readable name"
              />
            </div>

            <div className="form-group">
              <label>AI Context</label>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Describe the purpose and rules of this table for AI agents..."
                rows={4}
              />
            </div>

            <div className="form-actions">
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
