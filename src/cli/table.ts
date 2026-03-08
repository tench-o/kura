import { Command } from "commander";
import { openDatabase, getDbPath } from "../core/database.js";
import { parseColumnDef, createTable, listTables, describeTable, addColumn, dropTable } from "../core/schema.js";
import { displayTableList, displayTableSchema, displaySuccess } from "./display.js";

export function registerTableCommand(program: Command): void {
  const table = program
    .command("table")
    .description("Table management commands");

  table
    .command("create <name> [columns...]")
    .description("Create a new table with columns (format: name:type)")
    .action((name: string, columns: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const columnDefs = columns.map((c, i) => {
        const def = parseColumnDef(c);
        def.position = i;
        return def;
      });
      createTable(db, name, columnDefs);
      displaySuccess(`Table "${name}" created with ${columnDefs.length} column(s).`);
      db.close();
    });

  table
    .command("list")
    .description("List all tables")
    .action(() => {
      const db = openDatabase(getDbPath(program.opts().db));
      const tables = listTables(db);
      displayTableList(tables);
      db.close();
    });

  table
    .command("describe <name>")
    .description("Show table schema")
    .action((name: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const info = describeTable(db, name);
      displayTableSchema(info);
      db.close();
    });

  table
    .command("add-column <table> <column>")
    .description("Add a column to a table (format: name:type)")
    .action((tableName: string, column: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const colDef = parseColumnDef(column);
      addColumn(db, tableName, colDef);
      displaySuccess(`Column "${colDef.name}" added to "${tableName}".`);
      db.close();
    });

  table
    .command("drop <name>")
    .description("Drop a table")
    .action((name: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      dropTable(db, name);
      displaySuccess(`Table "${name}" dropped.`);
      db.close();
    });
}
