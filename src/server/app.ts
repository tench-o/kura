import { Hono } from "hono";
import type Database from "better-sqlite3";
import { KuraError, type FilterCondition, FILTER_OPERATORS } from "../core/types.js";
import { listTables, describeTable, createTable, dropTable, addColumn, modifyColumn, parseColumnDef } from "../core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord, countRecords } from "../core/records.js";
import { resolveRelations } from "../core/relations.js";
import { search } from "../core/search.js";

type Env = { Variables: { db: Database.Database } };

function kuraErrorToStatus(code: string): number {
  switch (code) {
    case "TABLE_NOT_FOUND":
    case "RECORD_NOT_FOUND":
      return 404;
    case "TABLE_ALREADY_EXISTS":
    case "COLUMN_ALREADY_EXISTS":
      return 409;
    case "INVALID_COLUMN_TYPE":
    case "INVALID_COLUMN_DEF":
    case "INVALID_DATA":
      return 400;
    default:
      return 500;
  }
}

export function createApp(db: Database.Database) {
  const app = new Hono<Env>();

  // Error handler
  app.onError((err, c) => {
    if (err instanceof KuraError) {
      const status = kuraErrorToStatus(err.code);
      return c.json({ error: { code: err.code, message: err.message } }, status as 400);
    }
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return c.json({ error: { code: "INTERNAL_ERROR", message } }, 500);
  });

  // DB injection middleware
  app.use("/api/*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  // ── Tables ──

  app.get("/api/tables", (c) => {
    return c.json(listTables(c.get("db")));
  });

  app.post("/api/tables", async (c) => {
    const body = await c.req.json<{ name: string; columns: string[] }>();
    const columnDefs = body.columns.map((col) => parseColumnDef(col));
    createTable(c.get("db"), body.name, columnDefs);
    return c.json({ success: true, message: `Table "${body.name}" created` }, 201);
  });

  app.get("/api/tables/:name", (c) => {
    return c.json(describeTable(c.get("db"), c.req.param("name")));
  });

  app.delete("/api/tables/:name", (c) => {
    const name = c.req.param("name");
    dropTable(c.get("db"), name);
    return c.json({ success: true, message: `Table "${name}" deleted` });
  });

  app.post("/api/tables/:name/columns", async (c) => {
    const tableName = c.req.param("name");
    const body = await c.req.json<{ column: string }>();
    const colDef = parseColumnDef(body.column);
    addColumn(c.get("db"), tableName, colDef);
    return c.json({ success: true, message: `Column "${colDef.name}" added` }, 201);
  });

  app.patch("/api/tables/:name/columns/:column", async (c) => {
    const tableName = c.req.param("name");
    const columnName = c.req.param("column");
    const body = await c.req.json<{ display_type: string | null }>();
    modifyColumn(c.get("db"), tableName, columnName, body.display_type);
    return c.json({ success: true, message: `Column "${columnName}" updated` });
  });

  // ── Records ──

  app.get("/api/tables/:name/records", (c) => {
    const db = c.get("db");
    const table = c.req.param("name");

    const sort = c.req.query("sort");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");
    const columnsParam = c.req.query("columns");
    const filtersParam = c.req.query("filters");

    const where: Record<string, string> = {};
    const queries = c.req.queries();
    for (const key of Object.keys(queries)) {
      if (key.startsWith("where.")) {
        const val = c.req.query(key);
        if (val !== undefined) where[key.slice(6)] = val;
      }
    }

    let filters: FilterCondition[] | undefined;
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        if (Array.isArray(parsed)) {
          filters = parsed.filter(
            (f: unknown): f is FilterCondition =>
              typeof f === "object" && f !== null &&
              "column" in f && "operator" in f &&
              FILTER_OPERATORS.includes((f as FilterCondition).operator),
          );
        }
      } catch {
        // ignore invalid JSON
      }
    }

    const columns = columnsParam ? columnsParam.split(",").map((c) => c.trim()) : undefined;
    const whereObj = Object.keys(where).length > 0 ? where : undefined;
    const opts = {
      where: whereObj,
      filters,
      columns,
      sort: sort || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    const recs = listRecords(db, table, opts);
    const resolved = resolveRelations(db, table, recs);
    const total = countRecords(db, table, { where: whereObj, filters });

    return c.json({
      records: resolved,
      rawRecords: recs,
      total,
      limit: opts.limit ?? null,
      offset: opts.offset ?? 0,
    });
  });

  app.get("/api/tables/:name/records/:id", (c) => {
    const db = c.get("db");
    const table = c.req.param("name");
    const id = parseInt(c.req.param("id"), 10);

    const record = getRecord(db, table, id);
    const [resolved] = resolveRelations(db, table, [record]);

    return c.json({ record: resolved, rawRecord: record });
  });

  app.post("/api/tables/:name/records", async (c) => {
    const db = c.get("db");
    const table = c.req.param("name");
    const data = await c.req.json();

    const record = addRecord(db, table, data);
    return c.json(record, 201);
  });

  app.patch("/api/tables/:name/records/:id", async (c) => {
    const db = c.get("db");
    const table = c.req.param("name");
    const id = parseInt(c.req.param("id"), 10);
    const data = await c.req.json();

    const record = updateRecord(db, table, id, data);
    return c.json(record);
  });

  app.delete("/api/tables/:name/records/:id", (c) => {
    const db = c.get("db");
    const table = c.req.param("name");
    const id = parseInt(c.req.param("id"), 10);

    deleteRecord(db, table, id);
    return c.json({ success: true, message: `Record #${id} deleted` });
  });

  // ── Search ──

  app.get("/api/search", (c) => {
    const db = c.get("db");
    const q = c.req.query("q") || "";
    const table = c.req.query("table");

    if (!q) return c.json([]);

    const results = search(db, q, table ? [table] : undefined);
    return c.json(results);
  });

  return app;
}
