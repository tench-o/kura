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
  server.tool("list_tables", "List all tables with their column schemas and record counts.", {}, () => {
    try {
      return jsonResponse(listTables(db));
    } catch (error) {
      return errorResponse(error);
    }
  });

  // 2. describe_table
  server.tool(
    "describe_table",
    "Get detailed schema for a table including column names, types, and relation targets.",
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
    `Create a new table with typed columns. Each column is a string in "name:type" format. Available types: text, int, real, bool, relation(target_table), relation[](target_table). relation creates a soft reference (no FK constraint). relation[] stores multiple references. Example columns: ["title:text", "pages:int", "read:bool", "author:relation(authors)", "tags:relation[](tags)"]`,
    { name: z.string().describe("Table name"), columns: z.array(z.string()).describe('Column definitions in "name:type" format') },
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
    "Add a new record to a table. For relation columns, pass the target record's ID as a number. For relation[] columns, pass a comma-separated string of IDs (e.g. \"1,2,3\"). All tables auto-generate id, created_at, and updated_at.",
    { table: z.string().describe("Table name"), data: z.record(z.string(), z.any()).describe("Key-value pairs matching the table columns") },
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
    "List records from a table with optional filters. Relations are automatically resolved to display values. Use describe_table first to see available columns.",
    {
      table: z.string().describe("Table name"),
      where: z.record(z.string(), z.string()).optional().describe('Filter conditions as key-value pairs, e.g. {"read": "1"}'),
      sort: z.string().optional().describe('Column to sort by. Prefix with "-" for descending, e.g. "-created_at"'),
      limit: z.number().optional().describe("Maximum number of records to return"),
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
    "Get a single record by ID. Relations are automatically resolved to display values.",
    { table: z.string().describe("Table name"), id: z.number().describe("Record ID") },
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
    "Update an existing record. Only specified fields are modified; other fields remain unchanged. updated_at is automatically refreshed.",
    { table: z.string().describe("Table name"), id: z.number().describe("Record ID"), data: z.record(z.string(), z.any()).describe("Key-value pairs of fields to update") },
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
    "Delete a record by ID. Soft relations referencing this record will show null (no cascade).",
    { table: z.string().describe("Table name"), id: z.number().describe("Record ID to delete") },
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
    "Full-text search across all tables using FTS5 (CJK supported). Returns matching records with snippets. Optionally limit to a specific table.",
    { query: z.string().describe("Search query text"), table: z.string().optional().describe("Limit search to this table") },
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
    "Execute raw SQL query against the SQLite database. SELECT queries return rows; other statements return success status. Internal tables are prefixed with _kura_.",
    { sql: z.string().describe("SQL query to execute") },
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
