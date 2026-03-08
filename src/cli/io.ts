import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import type { RecordData } from "../core/types.js";
import { openDatabase, getDbPath } from "../core/database.js";
import { describeTable } from "../core/schema.js";
import { addRecord, listRecords } from "../core/records.js";
import { resolveRelations } from "../core/relations.js";
import { displaySuccess } from "./display.js";

function parseCsv(content: string): RecordData[] {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const records: RecordData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const data: RecordData = {};
    for (let j = 0; j < headers.length; j++) {
      data[headers[j]] = values[j] ?? "";
    }
    records.push(data);
  }

  return records;
}

function parseJsonFile(content: string): RecordData[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON file must contain an array of objects");
  }
  return parsed as RecordData[];
}

export function registerIoCommands(program: Command): void {
  program
    .command("import <table> <file>")
    .description("Import records from CSV or JSON file")
    .action((table: string, file: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const filePath = path.resolve(file);
      const content = fs.readFileSync(filePath, "utf-8");
      const ext = path.extname(filePath).toLowerCase();

      let rows: RecordData[];
      if (ext === ".csv") {
        rows = parseCsv(content);
      } else if (ext === ".json") {
        rows = parseJsonFile(content);
      } else {
        throw new Error(`Unsupported file format: ${ext}. Use .csv or .json`);
      }

      for (const row of rows) {
        addRecord(db, table, row);
      }

      displaySuccess(`Imported ${rows.length} record(s) into "${table}".`);
      db.close();
    });

  program
    .command("export <table>")
    .description("Export records to stdout")
    .option("-f, --format <format>", "Output format: json or csv", "json")
    .action((table: string, opts: { format: string }) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const records = listRecords(db, table);
      const resolved = resolveRelations(db, table, records);
      const info = describeTable(db, table);
      const colNames = info.columns.map((c) => c.name);

      if (opts.format === "csv") {
        const headers = ["id", ...colNames, "created_at", "updated_at"];
        console.log(headers.join(","));
        for (const rec of resolved) {
          const values = [
            String(rec.id),
            ...colNames.map((n) => {
              const val = rec.data[n];
              return val === null || val === undefined ? "" : String(val);
            }),
            rec.created_at,
            rec.updated_at,
          ];
          console.log(values.join(","));
        }
      } else {
        const output = resolved.map((rec) => ({
          id: rec.id,
          ...Object.fromEntries(colNames.map((n) => [n, rec.data[n] ?? null])),
          created_at: rec.created_at,
          updated_at: rec.updated_at,
        }));
        console.log(JSON.stringify(output, null, 2));
      }

      db.close();
    });
}
