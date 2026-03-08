import { Command } from "commander";
import chalk from "chalk";
import { openDatabase, getDbPath } from "../core/database.js";
import { setAiContext, getAiContext, clearAiContext } from "../core/schema.js";
import { displaySuccess } from "./display.js";

export function registerContextCommand(program: Command): void {
  const context = program
    .command("context")
    .description("Manage AI context metadata for database, tables, and columns");

  context
    .command("set")
    .description(
      `Set AI context. Argument count determines level:
  1 arg  → DB level:      kura context set "DB description"
  2 args → Table level:   kura context set <table> "Table description"
  3 args → Column level:  kura context set <table> <column> "Column description"`,
    )
    .argument("<args...>", "Context arguments (see description)")
    .action((args: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      if (args.length === 1) {
        setAiContext(db, "database", args[0]);
        displaySuccess("Database AI context set.");
      } else if (args.length === 2) {
        setAiContext(db, "table", args[1], args[0]);
        displaySuccess(`AI context set for table "${args[0]}".`);
      } else if (args.length === 3) {
        setAiContext(db, "column", args[2], args[0], args[1]);
        displaySuccess(`AI context set for column "${args[0]}.${args[1]}".`);
      } else {
        console.error(chalk.red("Usage: kura context set [table] [column] <context>"));
        process.exit(1);
      }
      db.close();
    });

  context
    .command("show [table]")
    .description("Show AI context. Without args: DB + all tables. With table: table + columns.")
    .action((table?: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const info = getAiContext(db, table);

      if (info.database) {
        console.log(chalk.bold("Database:"));
        console.log(`  ${info.database}`);
        console.log();
      }

      if (info.tables && info.tables.length > 0) {
        console.log(chalk.bold("Tables:"));
        for (const t of info.tables) {
          console.log(`  ${chalk.cyan(t.name)}: ${t.aiContext}`);
        }
        console.log();
      }

      if (info.columns && info.columns.length > 0) {
        console.log(chalk.bold("Columns:"));
        for (const c of info.columns) {
          console.log(`  ${chalk.cyan(c.name)}: ${c.aiContext}`);
        }
        console.log();
      }

      if (!info.database && (!info.tables || info.tables.length === 0) && (!info.columns || info.columns.length === 0)) {
        console.log(chalk.yellow("No AI context set."));
      }

      db.close();
    });

  context
    .command("clear")
    .description(
      `Clear AI context. Argument count determines level:
  0 args → DB level:      kura context clear
  1 arg  → Table level:   kura context clear <table>
  2 args → Column level:  kura context clear <table> <column>`,
    )
    .argument("[args...]", "Optional table and column names")
    .action((args: string[]) => {
      const db = openDatabase(getDbPath(program.opts().db));
      if (args.length === 0) {
        clearAiContext(db, "database");
        displaySuccess("Database AI context cleared.");
      } else if (args.length === 1) {
        clearAiContext(db, "table", args[0]);
        displaySuccess(`AI context cleared for table "${args[0]}".`);
      } else if (args.length === 2) {
        clearAiContext(db, "column", args[0], args[1]);
        displaySuccess(`AI context cleared for column "${args[0]}.${args[1]}".`);
      } else {
        console.error(chalk.red("Usage: kura context clear [table] [column]"));
        process.exit(1);
      }
      db.close();
    });
}
