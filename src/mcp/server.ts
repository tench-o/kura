import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDatabase, getDbPath } from "../core/database.js";
import { listTables, describeTable, createTable, parseColumnDef } from "../core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord } from "../core/records.js";
import { resolveRelations } from "../core/relations.js";
import { search } from "../core/search.js";
import { KuraError } from "../core/types.js";

function errorResponse(error: unknown) {
  const message = error instanceof KuraError ? error.message : "An unexpected error occurred";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function jsonResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function startMcpServer(dbPath?: string): Promise<void> {
  const db = openDatabase(dbPath || getDbPath());

  const server = new McpServer({
    name: "kura",
    version: "0.1.0",
  });

  // 1. list_tables
  server.tool("list_tables", "List all tables and their schemas", {}, () => {
    try {
      return jsonResponse(listTables(db));
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 2. describe_table
  server.tool(
    "describe_table",
    "Get detailed schema for a table",
    { table: z.string() },
    ({ table }) => {
      try {
        return jsonResponse(describeTable(db, table));
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 3. create_table
  server.tool(
    "create_table",
    "Create a new table with typed columns",
    { name: z.string(), columns: z.array(z.string()) },
    ({ name, columns }) => {
      try {
        const columnDefs = columns.map((col) => parseColumnDef(col));
        createTable(db, name, columnDefs);
        return jsonResponse({ success: true, message: `Table "${name}" created` });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 4. add_record
  server.tool(
    "add_record",
    "Add a new record to a table",
    { table: z.string(), data: z.record(z.string(), z.any()) },
    ({ table, data }) => {
      try {
        const record = addRecord(db, table, data);
        return jsonResponse(record);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 5. list_records
  server.tool(
    "list_records",
    "List records from a table with optional filters",
    {
      table: z.string(),
      where: z.record(z.string(), z.string()).optional(),
      sort: z.string().optional(),
      limit: z.number().optional(),
    },
    ({ table, where, sort, limit }) => {
      try {
        const records = listRecords(db, table, { where, sort, limit });
        const resolved = resolveRelations(db, table, records);
        return jsonResponse(resolved);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 6. get_record
  server.tool(
    "get_record",
    "Get a single record by ID",
    { table: z.string(), id: z.number() },
    ({ table, id }) => {
      try {
        const record = getRecord(db, table, id);
        const [resolved] = resolveRelations(db, table, [record]);
        return jsonResponse(resolved);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 7. update_record
  server.tool(
    "update_record",
    "Update an existing record",
    { table: z.string(), id: z.number(), data: z.record(z.string(), z.any()) },
    ({ table, id, data }) => {
      try {
        const record = updateRecord(db, table, id, data);
        return jsonResponse(record);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 8. delete_record
  server.tool(
    "delete_record",
    "Delete a record by ID",
    { table: z.string(), id: z.number() },
    ({ table, id }) => {
      try {
        deleteRecord(db, table, id);
        return jsonResponse({ success: true, message: `Record #${id} deleted from "${table}"` });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 9. search
  server.tool(
    "search",
    "Full-text search across tables",
    { query: z.string(), table: z.string().optional() },
    ({ query, table }) => {
      try {
        const results = search(db, query, table ? [table] : undefined);
        return jsonResponse(results);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 10. run_query
  server.tool(
    "run_query",
    "Execute raw SQL query",
    { sql: z.string() },
    ({ sql: sqlText }) => {
      try {
        // Try as a query (SELECT) first
        try {
          const rows = db.prepare(sqlText).all();
          return jsonResponse(rows);
        } catch {
          // Fall back to exec for non-SELECT statements
          db.exec(sqlText);
          return jsonResponse({ success: true, message: "Query executed" });
        }
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
