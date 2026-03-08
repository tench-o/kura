import type { Command } from "commander";
import { openDatabase, getDbPath } from "../core/database.js";
import { search } from "../core/search.js";
import { displaySearchResults } from "./display.js";

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Full-text search across tables")
    .option("-t, --table <name>", "Limit search to a specific table")
    .action((query: string, opts: { table?: string }) => {
      const db = openDatabase(getDbPath(program.opts().db));
      const tables = opts.table ? [opts.table] : undefined;
      const results = search(db, query, tables);
      displaySearchResults(results);
      db.close();
    });
}
