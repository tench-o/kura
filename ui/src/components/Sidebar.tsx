import type { TableInfo } from "../types";

interface SidebarProps {
  tables: TableInfo[];
  activeTable: string | null;
  onTableSelect: (name: string) => void;
  onCreateTable: () => void;
}

const TABLE_ICONS: Record<string, string> = {};
const DEFAULT_ICON = "📋";

function getIcon(name: string): string {
  return TABLE_ICONS[name] || DEFAULT_ICON;
}

export function Sidebar({ tables, activeTable, onTableSelect, onCreateTable }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo">kura</span>
      </div>

      <div className="sidebar-section">Tables</div>
      {tables.map((t) => (
        <div
          key={t.name}
          className={`sidebar-item ${t.name === activeTable ? "active" : ""}`}
          onClick={() => onTableSelect(t.name)}
        >
          <span className="icon">{getIcon(t.name)}</span>
          {t.name}
          <span className="count">{t.recordCount}</span>
        </div>
      ))}
      <div className="sidebar-item" onClick={onCreateTable}>
        <span className="icon">+</span>
        New Table
      </div>

      <div className="sidebar-spacer" />
    </aside>
  );
}
