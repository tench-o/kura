import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { openDatabase, getDbPath } from "../core/database.js";

export function registerQueryCommand(program: Command): void {
  program
    .command("query <sql>")
    .description("Execute raw SQL query. For cross-table data, prefer 'list' with --expand or -c dot notation (e.g., kura list candidates -c name,position.title). Use query only for complex analytics or operations that structured commands cannot handle.")
    .action((sql: string) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const trimmed = sql.trim().toUpperCase();

      if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA") || trimmed.startsWith("WITH")) {
        const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;

        if (rows.length === 0) {
          console.log(chalk.yellow("No results."));
        } else {
          const keys = Object.keys(rows[0]);
          const table = new Table({
            head: keys.map((k) => chalk.cyan(k)),
          });
          for (const row of rows) {
            table.push(keys.map((k) => {
              const val = row[k];
              return val === null || val === undefined ? "" : String(val);
            }));
          }
          console.log(table.toString());
        }
      } else {
        const result = db.exec(sql);
        console.log(chalk.green("Query executed."));
      }

      db.close();
    });
}
