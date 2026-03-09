import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDatabase, getDbPath } from "../core/database.js";
import { listTables, describeTable, createTable, parseColumnDef, modifyColumn, setAiContext, getAiContext, clearAiContext } from "../core/schema.js";
import type { AiContextLevel } from "../core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord, countRecords } from "../core/records.js";
import { resolveRelations } from "../core/relations.js";
import { search } from "../core/search.js";
import { KuraError, FILTER_OPERATORS } from "../core/types.js";

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
    version: "0.2.0",
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
    "Get detailed schema for a table including column names, storage types, display types, and relation targets. Display types (e.g., select, url, currency) control how values are formatted and validated.",
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
    `Create a new table with typed columns. Each column is a string in "name:type" or "name:type/display" format. Storage types: text, int, real, bool, relation(target_table), relation[](target_table). Display types (optional, controls formatting & validation): select (tag/enum), url, email, date, phone, multiline, currency (¥1,000,000), rating (1-5 stars), percent (85.5%). Examples: ["title:text", "status:text/select", "budget:int/currency", "website:text/url", "author:relation(authors)"]`,
    { name: z.string().describe("Table name"), columns: z.array(z.string()).describe('Column definitions in "name:type" or "name:type/display" format') },
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

  // 4. modify_column
  server.tool(
    "modify_column",
    `Change the display type of an existing column. Display types control formatting and validation: select (tag/enum), url, email, date, phone, multiline, currency (¥1,000,000), rating (1-5 stars), percent (85.5%). Set display_type to null to remove it.`,
    {
      table: z.string().describe("Table name"),
      column: z.string().describe("Column name"),
      display_type: z.string().nullable().describe('New display type (e.g., "select", "currency", "url") or null to remove'),
    },
    ({ table, column, display_type }) => {
      try {
        modifyColumn(db, table, column, display_type);
        return jsonResponse({ success: true, message: `Column "${column}" display type updated` });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 5. add_record
  server.tool(
    "add_record",
    "Add a new record to a table. For relation columns, pass the target record's ID as a number. For relation[] columns, pass a comma-separated string of IDs (e.g. \"1,2,3\"). Values are validated against display_type if set (e.g., date format, rating 1-5, url format). All tables auto-generate id, created_at, and updated_at.",
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
    `List records from a table with optional filters. Relations are automatically resolved to display values. Use describe_table first to see available columns. Use "columns" to return only specific columns — only those columns will appear in the response. The "filters" parameter supports advanced filtering with operators: eq, neq, gt, gte, lt, lte, contains, not_contains, is_empty, is_not_empty. Each filter is {column, operator, value}. Multiple filters are combined with AND.`,
    {
      table: z.string().describe("Table name"),
      where: z.record(z.string(), z.string()).optional().describe('Simple exact-match filters as key-value pairs, e.g. {"read": "1"}'),
      filters: z.array(z.object({
        column: z.string().describe("Column name to filter on"),
        operator: z.enum(FILTER_OPERATORS).describe("Filter operator: eq, neq, gt, gte, lt, lte, contains, not_contains, is_empty, is_not_empty"),
        value: z.string().describe("Value to compare against (ignored for is_empty/is_not_empty)"),
      })).optional().describe('Advanced filter conditions with operators, combined with AND. Example: [{"column": "age", "operator": "gt", "value": "25"}, {"column": "name", "operator": "contains", "value": "Alice"}]'),
      columns: z.array(z.string()).optional().describe('Columns to return (default: all). Example: ["title", "rating"]'),
      sort: z.string().optional().describe('Column to sort by. Prefix with "-" for descending, e.g. "-created_at"'),
      limit: z.number().optional().describe("Maximum number of records to return"),
    },
    ({ table, where, filters, columns, sort, limit }) => {
      try {
        const records = listRecords(db, table, { where, filters, columns, sort, limit });
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
    "Update an existing record. Only specified fields are modified; other fields remain unchanged. Values are validated against display_type if set. updated_at is automatically refreshed.",
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

  // 10. set_ai_context
  server.tool(
    "set_ai_context",
    `Set AI context metadata at database, table, or column level. AI context describes meaning, rules, and usage notes for AI agents. Examples: "Recruitment DB used by HR team and interview bot", "One row per candidate. When status is 'offer', auto-add to notifications table", "Selection status. Flow: applied → interview → offer/rejected. Reason required on rejection."`,
    {
      level: z.enum(["database", "table", "column"]).describe("Context level"),
      context: z.string().describe("AI context text"),
      table: z.string().optional().describe("Table name (required for table/column level)"),
      column: z.string().optional().describe("Column name (required for column level)"),
    },
    ({ level, context, table, column }) => {
      try {
        setAiContext(db, level, context, table, column);
        return jsonResponse({ success: true, message: `AI context set at ${level} level` });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 11. get_ai_context
  server.tool(
    "get_ai_context",
    "Get AI context metadata. Without table: returns DB-level context and all table contexts. With table: returns DB-level, table, and column contexts for that table.",
    {
      table: z.string().optional().describe("Table name (optional, for table-specific context)"),
    },
    ({ table }) => {
      try {
        return jsonResponse(getAiContext(db, table));
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 12. clear_ai_context
  server.tool(
    "clear_ai_context",
    "Clear AI context metadata at database, table, or column level.",
    {
      level: z.enum(["database", "table", "column"]).describe("Context level to clear"),
      table: z.string().optional().describe("Table name (required for table/column level)"),
      column: z.string().optional().describe("Column name (required for column level)"),
    },
    ({ level, table, column }) => {
      try {
        clearAiContext(db, level, table, column);
        return jsonResponse({ success: true, message: `AI context cleared at ${level} level` });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 13. count_records
  server.tool(
    "count_records",
    `Count records in a table with optional filters. Faster than list_records when you only need the count. Supports the same filtering as list_records.`,
    {
      table: z.string().describe("Table name"),
      where: z.record(z.string(), z.string()).optional().describe('Simple exact-match filters as key-value pairs, e.g. {"status": "書類選考"}'),
      filters: z.array(z.object({
        column: z.string().describe("Column name to filter on"),
        operator: z.enum(FILTER_OPERATORS).describe("Filter operator"),
        value: z.string().describe("Value to compare against"),
      })).optional().describe("Advanced filter conditions with operators"),
    },
    ({ table, where, filters }) => {
      try {
        const count = countRecords(db, table, { where, filters });
        return jsonResponse({ table, count });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // 14. run_query
  server.tool(
    "run_query",
    "Execute raw SQL query against the SQLite database. SELECT queries return rows; other statements return success status. Internal tables are prefixed with _kura_. IMPORTANT: Relation columns store foreign IDs directly under the column name without '_id' suffix. For example, if a column is defined as 'position:relation(positions)', the SQLite column is 'position' (not 'position_id'). Use 'JOIN positions p ON c.position = p.id', not 'c.position_id'. Use 'table describe <name>' tool or '_kura_meta' table to check column names before writing JOINs.",
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
