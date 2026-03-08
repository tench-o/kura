interface StatusBarProps {
  total: number;
  columns: number;
}

export function StatusBar({ total, columns }: StatusBarProps) {
  return (
    <div className="statusbar">
      <span>
        <strong>{total}</strong> records
      </span>
      <span>·</span>
      <span>{columns} columns</span>
    </div>
  );
}
