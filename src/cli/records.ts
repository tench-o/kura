import type { Command } from "commander";
import type { RecordData, FilterCondition } from "../core/types.js";
import { FILTER_OPERATORS, type FilterOperator } from "../core/types.js";
import { openDatabase, getDbPath } from "../core/database.js";
import { describeTable } from "../core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord } from "../core/records.js";
import { resolveRelations } from "../core/relations.js";
import { displayTable, displayRecord, displaySuccess } from "./display.js";

function parseKeyValue(entries: string[]): RecordData {
  const data: RecordData = {};
  for (const entry of entries) {
    const idx = entry.indexOf("=");
    if (idx === -1) {
      throw new Error(`Invalid entry "${entry}". Expected format: key=value`);
    }
    const key = entry.slice(0, idx);
    const value = entry.slice(idx + 1);
    data[key] = value;
  }
  return data;
}

const OPERATOR_ALIASES: Record<string, FilterOperator> = {
  "eq": "eq", "=": "eq", "is": "eq",
  "neq": "neq", "!=": "neq", "is_not": "neq",
  "gt": "gt", ">": "gt",
  "gte": "gte", ">=": "gte",
  "lt": "lt", "<": "lt",
  "lte": "lte", "<=": "lte",
  "contains": "contains", "like": "contains",
  "not_contains": "not_contains", "not_like": "not_contains",
  "is_empty": "is_empty", "empty": "is_empty",
  "is_not_empty": "is_not_empty", "not_empty": "is_not_empty",
};

function parseFilter(expr: string): FilterCondition {
  // Format: column:operator:value  (value is optional for is_empty/is_not_empty)
  const parts = expr.split(":");
  if (parts.length < 2) {
    throw new Error(`Invalid filter "${expr}". Expected format: column:operator:value`);
  }
  const column = parts[0];
  const opStr = parts[1];
  const value = parts.slice(2).join(":"); // rejoin in case value contains colons

  const operator = OPERATOR_ALIASES[opStr];
  if (!operator || !FILTER_OPERATORS.includes(operator)) {
    throw new Error(`Unknown filter operator "${opStr}". Available: ${Object.keys(OPERATOR_ALIASES).join(", ")}`);
  }

  return { column, operator, value };
}

export function registerRecordCommands(program: Command): void {
  program
    .command("add <table> [entries...]")
    .description(
      `Add a record to a table.
  Format: key=value pairs. For relation columns, use the target record ID.
  For relation[] columns, use comma-separated IDs.
  Example: kura add books title="Kafka on the Shore" pages=480 author=1 genres=1,2`,
    )
    .action((table: string, entries: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const data = parseKeyValue(entries);
      const record = addRecord(db, table, data);
      displaySuccess(`Record #${record.id} added to "${table}".`);
      db.close();
    });

  program
    .command("list <table>")
    .description(
      `List records in a table. Relations are auto-resolved to display values.
  Example: kura list books --where "read=1" --sort "-rating" --limit 10
  Example: kura list books --filter "pages:gt:300" --filter "title:contains:Kafka"
  Filter format: column:operator:value
  Operators: eq(=), neq(!=), gt(>), gte(>=), lt(<), lte(<=), contains, not_contains, is_empty, is_not_empty`,
    )
    .option("-w, --where <condition...>", "Filter by key=value (exact match)")
    .option("-f, --filter <expr...>", "Filter by column:operator:value (operators: eq, neq, gt, gte, lt, lte, contains, not_contains, is_empty, is_not_empty)")
    .option("-s, --sort <column>", "Sort by column (prefix with - for DESC)")
    .option("-l, --limit <n>", "Limit results", parseInt)
    .option("-o, --offset <n>", "Offset results", parseInt)
    .option("--raw", "Show raw values without resolving relations")
    .action((table: string, opts: { where?: string[]; filter?: string[]; sort?: string; limit?: number; offset?: number; raw?: boolean }) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const where: Record<string, string> = {};
      if (opts.where) {
        for (const w of opts.where) {
          const idx = w.indexOf("=");
          if (idx !== -1) {
            where[w.slice(0, idx)] = w.slice(idx + 1);
          }
        }
      }

      const filters: FilterCondition[] = [];
      if (opts.filter) {
        for (const f of opts.filter) {
          filters.push(parseFilter(f));
        }
      }

      let records = listRecords(db, table, {
        where: Object.keys(where).length > 0 ? where : undefined,
        filters: filters.length > 0 ? filters : undefined,
        sort: opts.sort,
        limit: opts.limit,
        offset: opts.offset,
      });

      if (!opts.raw) {
        records = resolveRelations(db, table, records);
      }

      const info = describeTable(db, table);
      displayTable(records, info.columns);
      db.close();
    });

  program
    .command("get <table> <id>")
    .description("Get a single record by ID")
    .action((table: string, id: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      let record = getRecord(db, table, parseInt(id, 10));
      const resolved = resolveRelations(db, table, [record]);
      record = resolved[0];
      const info = describeTable(db, table);
      displayRecord(record, info.columns);
      db.close();
    });

  program
    .command("update <table> <id> [entries...]")
    .description(
      `Update a record by ID.
  Format: key=value pairs (only specified fields are updated).
  Example: kura update books 1 rating=4.9 read=true`,
    )
    .action((table: string, id: string, entries: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const data = parseKeyValue(entries);
      updateRecord(db, table, parseInt(id, 10), data);
      displaySuccess(`Record #${id} updated in "${table}".`);
      db.close();
    });

  program
    .command("delete <table> <id>")
    .description("Delete a record by ID")
    .action((table: string, id: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      deleteRecord(db, table, parseInt(id, 10));
      displaySuccess(`Record #${id} deleted from "${table}".`);
      db.close();
    });
}
