import { Command } from "commander";
import { openDatabase, getDbPath } from "../core/database.js";
import { parseColumnDef, createTable, listTables, describeTable, addColumn, modifyColumn, dropTable } from "../core/schema.js";
import { displayTableList, displayTableSchema, displaySuccess } from "./display.js";

export function registerTableCommand(program: Command): void {
  const table = program
    .command("table")
    .description("Table management commands");

  table
    .command("create <name> [columns...]")
    .description(
      `Create a new table with typed columns.
  Column format: name:type or name:type/display
  Storage types: text, int, real, bool, relation(table), relation[](table)
  Display types (optional): select, url, email, date, phone, multiline, currency, rating, percent
  Examples:
    kura table create books title:text pages:int rating:real read:bool
    kura table create books "author:relation(authors)" "tags:relation[](tags)"
    kura table create positions title:text status:text/select budget:int/currency
    kura table create contacts name:text email:text/email website:text/url`,
    )
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
    .description(
      `Add a column to a table.
  Column format: name:type or name:type/display (same types as table create)
  Examples:
    kura table add-column books isbn:text
    kura table add-column books status:text/select
    kura table add-column invoices amount:int/currency`,
    )
    .action((tableName: string, column: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const colDef = parseColumnDef(column);
      addColumn(db, tableName, colDef);
      displaySuccess(`Column "${colDef.name}" added to "${tableName}".`);
      db.close();
    });

  table
    .command("modify-column <table> <column> <display-type>")
    .description(
      `Change the display type of a column.
  Display types: select, url, email, date, phone, multiline, currency, rating, percent
  Use "none" to remove the display type.
  Examples:
    kura table modify-column books status select
    kura table modify-column invoices amount currency
    kura table modify-column books status none`,
    )
    .action((tableName: string, column: string, displayType: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const value = displayType === "none" ? null : displayType;
      modifyColumn(db, tableName, column, value);
      if (value) {
        displaySuccess(`Column "${column}" in "${tableName}" display type set to "${value}".`);
      } else {
        displaySuccess(`Column "${column}" in "${tableName}" display type cleared.`);
      }
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
