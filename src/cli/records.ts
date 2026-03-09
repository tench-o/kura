import type { Command } from "commander";
import type { RecordData, FilterCondition, ColumnDef, ExpandedKuraRecord, ExpandedRelationRecord, ExpandedRecordValue, KuraRecord } from "../core/types.js";
import { FILTER_OPERATORS, type FilterOperator } from "../core/types.js";
import { openDatabase, getDbPath } from "../core/database.js";
import { describeTable } from "../core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord, countRecords } from "../core/records.js";
import { resolveRelations, expandRelations } from "../core/relations.js";
import { displayTable, displayRecord, displayExpandedRecord, displaySuccess, displayCount } from "./display.js";

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

/**
 * Flatten expanded records for table display.
 * Expands nested relation objects into dot-notation columns (e.g., company.name).
 */
function flattenExpandedForTable(
  expanded: ExpandedKuraRecord[],
  allColumns: ColumnDef[],
  expandCols: string[],
  requestedColumns: string[] | undefined,
  dotCols: Array<{ relation: string; field: string }>,
): { flatRecords: KuraRecord[]; flatCols: ColumnDef[] } {
  const expandSet = new Set(expandCols);
  const flatCols: ColumnDef[] = [];
  let position = 0;

  // Build set of dot column specs per relation
  const dotFieldsByRelation = new Map<string, string[]>();
  for (const d of dotCols) {
    if (!dotFieldsByRelation.has(d.relation)) {
      dotFieldsByRelation.set(d.relation, []);
    }
    dotFieldsByRelation.get(d.relation)!.push(d.field);
  }

  // Determine which fields to show for each expanded relation
  // If dot notation was used, show only those fields; otherwise show all fields from first non-null record
  const expandedFieldsByRelation = new Map<string, string[]>();

  for (const colName of expandCols) {
    const dotFields = dotFieldsByRelation.get(colName);
    if (dotFields && dotFields.length > 0) {
      expandedFieldsByRelation.set(colName, dotFields);
    } else {
      // Discover fields from expanded data
      const fields = new Set<string>();
      for (const rec of expanded) {
        const val = rec.data[colName];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          for (const key of Object.keys(val)) {
            if (key !== "id") fields.add(key);
          }
        } else if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === "object") {
              for (const key of Object.keys(item)) {
                if (key !== "id") fields.add(key);
              }
            }
          }
        }
      }
      if (fields.size > 0) {
        expandedFieldsByRelation.set(colName, [...fields]);
      }
    }
  }

  // Build flat column definitions
  for (const col of allColumns) {
    if (requestedColumns && !requestedColumns.includes(col.name) && !expandSet.has(col.name)) {
      // Skip columns not requested (unless they're expanded via dot notation parent)
      const isDotParent = dotCols.some((d) => d.relation === col.name);
      if (!isDotParent) continue;
    }

    if (expandSet.has(col.name)) {
      const fields = expandedFieldsByRelation.get(col.name);
      if (fields) {
        for (const field of fields) {
          flatCols.push({
            name: `${col.name}.${field}`,
            type: "text",
            position: position++,
          });
        }
      }
    } else {
      flatCols.push({ ...col, position: position++ });
    }
  }

  // Build flat records
  const flatRecords: KuraRecord[] = expanded.map((rec) => {
    const data: RecordData = {};
    for (const flatCol of flatCols) {
      const dotIdx = flatCol.name.indexOf(".");
      if (dotIdx !== -1) {
        const relName = flatCol.name.slice(0, dotIdx);
        const fieldName = flatCol.name.slice(dotIdx + 1);
        const val = rec.data[relName];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          const nested = val as ExpandedRelationRecord;
          data[flatCol.name] = nested[fieldName] ?? null;
        } else if (Array.isArray(val)) {
          // For relation[], join field values with comma
          const values = (val as ExpandedRelationRecord[])
            .map((item) => item[fieldName])
            .filter((v) => v !== null && v !== undefined)
            .map(String);
          data[flatCol.name] = values.join(", ");
        } else {
          data[flatCol.name] = null;
        }
      } else {
        data[flatCol.name] = rec.data[flatCol.name] as RecordValue;
      }
    }
    return {
      id: rec.id,
      data,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
    };
  });

  return { flatRecords, flatCols };
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
  Example: kura list books --columns title,rating
  Filter format: column:operator:value
  Operators: eq(=), neq(!=), gt(>), gte(>=), lt(<), lte(<=), contains, not_contains, is_empty, is_not_empty
  Use -c/--columns to select specific columns (comma-separated). Only specified columns are displayed.`,
    )
    .option("-w, --where <condition...>", "Filter by key=value (exact match)")
    .option("-f, --filter <expr...>", "Filter by column:operator:value (operators: eq, neq, gt, gte, lt, lte, contains, not_contains, is_empty, is_not_empty)")
    .option("-c, --columns <cols>", "Columns to display (comma-separated). Use dot notation for relation fields (e.g., company.name,company.industry)")
    .option("-e, --expand <cols>", "Expand relation columns into full nested objects (comma-separated). Use without value to expand all.")
    .option("-s, --sort <column>", "Sort by column (prefix with - for DESC)")
    .option("-l, --limit <n>", "Limit results", parseInt)
    .option("-o, --offset <n>", "Offset results", parseInt)
    .option("--raw", "Show raw values without resolving relations")
    .option("-H, --humanize", "Use column aliases for display headers")
    .action((table: string, opts: { where?: string[]; filter?: string[]; columns?: string; expand?: string; sort?: string; limit?: number; offset?: number; raw?: boolean; humanize?: boolean }) => {
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

      const rawColumns = opts.columns ? opts.columns.split(",").map((c) => c.trim()) : undefined;

      // Parse dot notation columns (e.g., "company.name" → relation: "company", field: "name")
      const dotCols: Array<{ relation: string; field: string }> = [];
      const plainCols: string[] = [];
      if (rawColumns) {
        for (const c of rawColumns) {
          const dotIdx = c.indexOf(".");
          if (dotIdx !== -1) {
            dotCols.push({ relation: c.slice(0, dotIdx), field: c.slice(dotIdx + 1) });
          } else {
            plainCols.push(c);
          }
        }
      }

      // Determine which relation columns need expanding
      const expandFromDots = [...new Set(dotCols.map((d) => d.relation))];
      const expandFromFlag = opts.expand ? opts.expand.split(",").map((c) => c.trim()) : [];
      const expandCols = [...new Set([...expandFromDots, ...expandFromFlag])];
      const needsExpand = expandCols.length > 0;

      // Ensure relation columns referenced by dots are included in query columns
      const queryColumns = rawColumns
        ? [...new Set([...plainCols, ...expandFromDots])]
        : undefined;

      let records = listRecords(db, table, {
        where: Object.keys(where).length > 0 ? where : undefined,
        filters: filters.length > 0 ? filters : undefined,
        columns: queryColumns,
        sort: opts.sort,
        limit: opts.limit,
        offset: opts.offset,
      });

      const info = describeTable(db, table);

      if (opts.raw) {
        const displayCols = queryColumns
          ? info.columns.filter((c) => queryColumns.includes(c.name))
          : info.columns;
        displayTable(records, displayCols, queryColumns);
        db.close();
        return;
      }

      if (needsExpand) {
        const expanded = expandRelations(db, table, records, expandCols);

        // Flatten expanded records for table display
        const { flatRecords, flatCols } = flattenExpandedForTable(
          expanded, info.columns, expandCols, rawColumns, dotCols,
        );

        let finalCols = flatCols;
        let finalRecords = flatRecords;

        if (opts.humanize) {
          const aliasMap = new Map<string, string>();
          for (const col of info.columns) {
            if (col.alias) aliasMap.set(col.name, col.alias);
          }
          finalCols = finalCols.map((col) => ({
            ...col,
            name: aliasMap.get(col.name) || col.name,
          }));
        }

        displayTable(finalRecords, finalCols, rawColumns ? flatCols.map((c) => c.name) : undefined);
      } else {
        records = resolveRelations(db, table, records);

        let displayCols = rawColumns
          ? info.columns.filter((c) => rawColumns.includes(c.name))
          : info.columns;

        if (opts.humanize) {
          const aliasMap = new Map<string, string>();
          for (const col of displayCols) {
            if (col.alias) aliasMap.set(col.name, col.alias);
          }
          displayCols = displayCols.map((col) => ({
            ...col,
            name: col.alias || col.name,
          }));
          if (aliasMap.size > 0) {
            records = records.map((rec) => {
              const newData: Record<string, any> = {};
              for (const [key, val] of Object.entries(rec.data)) {
                newData[aliasMap.get(key) || key] = val;
              }
              return { ...rec, data: newData };
            });
          }
        }

        displayTable(records, displayCols, rawColumns);
      }

      db.close();
    });

  program
    .command("get <table> <id>")
    .description("Get a single record by ID. Use --expand to show full related records.")
    .option("-e, --expand [cols]", "Expand relation columns (comma-separated, or omit for all)")
    .option("-H, --humanize", "Use column aliases for display labels")
    .action((table: string, id: string, opts: { expand?: string | boolean; humanize?: boolean }) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const record = getRecord(db, table, parseInt(id, 10));
      const info = describeTable(db, table);

      if (opts.expand !== undefined) {
        const expandCols = typeof opts.expand === "string"
          ? opts.expand.split(",").map((c) => c.trim())
          : undefined;
        const [expanded] = expandRelations(db, table, [record], expandCols);
        displayExpandedRecord(expanded, info.columns);
      } else {
        let [resolved] = resolveRelations(db, table, [record]);
        let displayCols = info.columns;

        if (opts.humanize) {
          const aliasMap = new Map<string, string>();
          for (const col of displayCols) {
            if (col.alias) aliasMap.set(col.name, col.alias);
          }
          displayCols = displayCols.map((col) => ({
            ...col,
            name: col.alias || col.name,
          }));
          if (aliasMap.size > 0) {
            const newData: Record<string, any> = {};
            for (const [key, val] of Object.entries(resolved.data)) {
              newData[aliasMap.get(key) || key] = val;
            }
            resolved = { ...resolved, data: newData };
          }
        }

        displayRecord(resolved, displayCols);
      }

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

  program
    .command("count <table>")
    .description(
      `Count records in a table, optionally with filters.
  Example: kura count candidates --where "status=書類選考"
  Example: kura count books --filter "pages:gt:300"`,
    )
    .option("-w, --where <condition...>", "Filter by key=value (exact match)")
    .option("-f, --filter <expr...>", "Filter by column:operator:value")
    .action((table: string, opts: { where?: string[]; filter?: string[] }) => {
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

      const count = countRecords(db, table, {
        where: Object.keys(where).length > 0 ? where : undefined,
        filters: filters.length > 0 ? filters : undefined,
      });

      displayCount(table, count, opts.where, opts.filter);
      db.close();
    });
}
