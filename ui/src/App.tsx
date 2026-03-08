import { useState, useCallback } from "react";
import { useTables } from "./hooks/useTables";
import { useRecords } from "./hooks/useRecords";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Toolbar } from "./components/Toolbar";
import { RecordTable } from "./components/RecordTable";
import { StatusBar } from "./components/StatusBar";
import { RecordModal } from "./components/RecordModal";
import { RecordForm } from "./components/RecordForm";
import { TableCreateForm } from "./components/TableCreateForm";
import { SearchResults } from "./components/SearchBar";
import { Toast } from "./components/Toast";
import { api } from "./api/client";
import type { ColumnDef, SearchResult } from "./types";

export function App() {
  const { tables, refresh: refreshTables } = useTables();
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const activeTable = currentTable || tables[0]?.name || null;
  const tableInfo = tables.find((t) => t.name === activeTable);

  const {
    records,
    rawRecords,
    total,
    offset,
    sort,
    pageSize,
    toggleSort,
    nextPage,
    prevPage,
    refresh: refreshRecords,
  } = useRecords(activeTable);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleTableSelect = useCallback((name: string) => {
    setCurrentTable(name);
    setSearchResults(null);
    setSelectedRecordId(null);
  }, []);

  const handleRecordClick = useCallback((id: number) => {
    setSelectedRecordId(id);
  }, []);

  const handleRecordSaved = useCallback(() => {
    refreshRecords();
    refreshTables();
  }, [refreshRecords, refreshTables]);

  const handleTableCreated = useCallback(async (name: string) => {
    await refreshTables();
    setCurrentTable(name);
    setShowCreateTable(false);
    showToast(`Table "${name}" created`);
  }, [refreshTables, showToast]);

  const handleTableDeleted = useCallback(async () => {
    await refreshTables();
    setCurrentTable(null);
    showToast("Table deleted");
  }, [refreshTables, showToast]);

  const handleSearchResults = useCallback((results: SearchResult[] | null) => {
    setSearchResults(results);
  }, []);

  const handleSearchResultClick = useCallback((table: string, id: number) => {
    setCurrentTable(table);
    setSearchResults(null);
    setSelectedRecordId(id);
  }, []);

  const handleModifyColumn = useCallback(async (column: string, displayType: string | null) => {
    if (!activeTable) return;
    try {
      await api.modifyColumn(activeTable, column, displayType);
      refreshTables();
      refreshRecords();
      showToast(`Column "${column}" display type updated`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update column", "error");
    }
  }, [activeTable, refreshTables, refreshRecords, showToast]);

  const columns: ColumnDef[] = tableInfo?.columns || [];

  return (
    <div className="app">
      <Sidebar
        tables={tables}
        activeTable={activeTable}
        onTableSelect={handleTableSelect}
        onCreateTable={() => setShowCreateTable(true)}
      />
      <div className="main">
        {activeTable ? (
          <>
            <Topbar
              tableName={activeTable}
              onNewRecord={() => setShowAddForm(true)}
              onDeleteTable={handleTableDeleted}
              onAddColumn={() => {
                refreshTables();
                refreshRecords();
              }}
              columns={columns}
            />
            <Toolbar
              onSearch={handleSearchResults}
              table={activeTable}
              sort={sort}
            />
            {searchResults ? (
              <SearchResults
                results={searchResults}
                onResultClick={handleSearchResultClick}
                onClear={() => setSearchResults(null)}
              />
            ) : (
              <>
                <RecordTable
                  records={records}
                  columns={columns}
                  sort={sort}
                  onSort={toggleSort}
                  onRecordClick={handleRecordClick}
                  onNewRecord={() => setShowAddForm(true)}
                  onNavigateTable={handleTableSelect}
                  onModifyColumn={handleModifyColumn}
                />
                {total > pageSize && (
                  <div className="pagination">
                    <button className="btn" onClick={prevPage} disabled={offset === 0}>
                      Prev
                    </button>
                    <span className="page-info">
                      {offset + 1}–{Math.min(offset + pageSize, total)} / {total}
                    </span>
                    <button className="btn" onClick={nextPage} disabled={offset + pageSize >= total}>
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
            <StatusBar total={total} columns={columns.length} />
          </>
        ) : (
          <div className="empty-state">
            <div className="icon">📦</div>
            <p>No tables yet</p>
            <button className="btn btn-primary" onClick={() => setShowCreateTable(true)}>
              Create Table
            </button>
          </div>
        )}
      </div>

      {selectedRecordId !== null && activeTable && (
        <RecordModal
          table={activeTable}
          recordId={selectedRecordId}
          columns={columns}
          onClose={() => setSelectedRecordId(null)}
          onSaved={handleRecordSaved}
          onDeleted={() => {
            setSelectedRecordId(null);
            handleRecordSaved();
            showToast("Record deleted");
          }}
          onNavigateTable={handleTableSelect}
          showToast={showToast}
        />
      )}

      {showAddForm && activeTable && (
        <RecordForm
          table={activeTable}
          columns={columns}
          rawRecords={rawRecords}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false);
            handleRecordSaved();
            showToast("Record added");
          }}
          showToast={showToast}
        />
      )}

      {showCreateTable && (
        <TableCreateForm
          onClose={() => setShowCreateTable(false)}
          onCreated={handleTableCreated}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
