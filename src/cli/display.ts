import chalk from "chalk";
import Table from "cli-table3";
import type { KuraRecord, ColumnDef, TableInfo, SearchResult } from "../core/types.js";

export function displayTable(records: KuraRecord[], columns: ColumnDef[], selectedColumns?: string[]): void {
  if (records.length === 0) {
    console.log(chalk.yellow("No records found."));
    return;
  }

  const colNames = columns.map((c) => c.name);

  // When --columns is specified, only show those columns
  // User can include id, created_at, updated_at explicitly if needed
  const showId = !selectedColumns || selectedColumns.includes("id");
  const showCreatedAt = !selectedColumns || selectedColumns.includes("created_at");
  const showUpdatedAt = !selectedColumns || selectedColumns.includes("updated_at");

  const headers: string[] = [];
  const colAligns: Array<"left" | "right"> = [];

  if (showId) {
    headers.push(chalk.cyan("id"));
    colAligns.push("right");
  }
  for (const n of colNames) {
    headers.push(chalk.cyan(n));
    colAligns.push("left");
  }
  if (showCreatedAt) {
    headers.push(chalk.cyan("created_at"));
    colAligns.push("left");
  }
  if (showUpdatedAt) {
    headers.push(chalk.cyan("updated_at"));
    colAligns.push("left");
  }

  const table = new Table({
    head: headers,
    colAligns,
  });

  for (const rec of records) {
    const row: string[] = [];
    if (showId) row.push(String(rec.id));
    for (const n of colNames) {
      const val = rec.data[n];
      row.push(val === null || val === undefined ? "" : String(val));
    }
    if (showCreatedAt) row.push(rec.created_at);
    if (showUpdatedAt) row.push(rec.updated_at);
    table.push(row);
  }

  console.log(table.toString());
}

export function displayRecord(record: KuraRecord, columns: ColumnDef[]): void {
  const table = new Table();

  table.push([chalk.cyan("id"), String(record.id)]);
  for (const col of columns) {
    const val = record.data[col.name];
    table.push([chalk.cyan(col.name), val === null || val === undefined ? "" : String(val)]);
  }
  table.push([chalk.cyan("created_at"), record.created_at]);
  table.push([chalk.cyan("updated_at"), record.updated_at]);

  console.log(table.toString());
}

export function displayTableList(tables: TableInfo[]): void {
  if (tables.length === 0) {
    console.log(chalk.yellow("No tables found."));
    return;
  }

  const table = new Table({
    head: [chalk.cyan("Table"), chalk.cyan("Columns"), chalk.cyan("Records")],
  });

  for (const t of tables) {
    table.push([t.name, String(t.columns.length), String(t.recordCount)]);
  }

  console.log(table.toString());
}

export function displayTableSchema(info: TableInfo): void {
  console.log(chalk.bold(`Table: ${info.name}`));
  console.log(`Records: ${info.recordCount}`);
  if (info.aiContext) {
    console.log(`AI Context: ${info.aiContext}`);
  }
  console.log();

  // Check if any column has ai_context
  const hasAiContext = info.columns.some((c) => c.aiContext);
  const headers = [chalk.cyan("Column"), chalk.cyan("Type"), chalk.cyan("Relation Target")];
  if (hasAiContext) {
    headers.push(chalk.cyan("AI Context"));
  }

  const table = new Table({ head: headers });

  // Built-in columns
  const autoRow = ["id", "INTEGER (auto)", ""];
  if (hasAiContext) autoRow.push("");
  table.push(autoRow);

  for (const col of info.columns) {
    const target = col.relationTarget ?? "";
    const row = [col.name, col.type, target];
    if (hasAiContext) row.push(col.aiContext ?? "");
    table.push(row);
  }

  const createdRow = ["created_at", "TEXT (auto)", ""];
  if (hasAiContext) createdRow.push("");
  table.push(createdRow);

  const updatedRow = ["updated_at", "TEXT (auto)", ""];
  if (hasAiContext) updatedRow.push("");
  table.push(updatedRow);

  console.log(table.toString());
}

export function displaySearchResults(results: SearchResult[]): void {
  if (results.length === 0) {
    console.log(chalk.yellow("No results found."));
    return;
  }

  // Group by table
  const grouped = new Map<string, SearchResult[]>();
  for (const r of results) {
    if (!grouped.has(r.table)) {
      grouped.set(r.table, []);
    }
    grouped.get(r.table)!.push(r);
  }

  for (const [tableName, tableResults] of grouped) {
    console.log(chalk.bold(`\n${tableName}`));

    const table = new Table({
      head: [chalk.cyan("id"), chalk.cyan("Matched Column"), chalk.cyan("Snippet")],
      colAligns: ["right", "left", "left"],
    });

    for (const r of tableResults) {
      table.push([String(r.id), r.matchedColumn, r.snippet]);
    }

    console.log(table.toString());
  }
}

export function displayCount(table: string, count: number, where?: string[], filter?: string[]): void {
  const conditions: string[] = [];
  if (where) conditions.push(...where);
  if (filter) conditions.push(...filter);

  if (conditions.length > 0) {
    console.log(`${chalk.bold(table)}: ${chalk.cyan(String(count))} records (filtered by: ${conditions.join(", ")})`);
  } else {
    console.log(`${chalk.bold(table)}: ${chalk.cyan(String(count))} records`);
  }
}

export function displaySuccess(msg: string): void {
  console.log(chalk.green("\u2713") + " " + msg);
}

export function displayError(msg: string): void {
  console.error(chalk.red("\u2717") + " " + msg);
}

export function displayRawJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
