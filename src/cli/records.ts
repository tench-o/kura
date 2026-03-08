import type { Command } from "commander";
import type { RecordData } from "../core/types.js";
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

export function registerRecordCommands(program: Command): void {
  program
    .command("add <table> [entries...]")
    .description("Add a record (format: key=value)")
    .action((table: string, entries: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const data = parseKeyValue(entries);
      const record = addRecord(db, table, data);
      displaySuccess(`Record #${record.id} added to "${table}".`);
      db.close();
    });

  program
    .command("list <table>")
    .description("List records in a table")
    .option("-w, --where <condition...>", "Filter by key=value")
    .option("-s, --sort <column>", "Sort by column (prefix with - for DESC)")
    .option("-l, --limit <n>", "Limit results", parseInt)
    .option("-o, --offset <n>", "Offset results", parseInt)
    .option("--raw", "Show raw values without resolving relations")
    .action((table: string, opts: { where?: string[]; sort?: string; limit?: number; offset?: number; raw?: boolean }) => {
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

      let records = listRecords(db, table, {
        where: Object.keys(where).length > 0 ? where : undefined,
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
    .description("Update a record (format: key=value)")
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
