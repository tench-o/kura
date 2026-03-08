import type { Command } from "commander";
import { openDatabase, getDbPath } from "../core/database.js";

export function registerUiCommand(program: Command): void {
  program
    .command("ui")
    .description("Start Web UI server")
    .option("-p, --port <port>", "Port number", "51730")
    .option("--dev", "Development mode (API only, no static files)")
    .action(async (options) => {
      const dbPath = getDbPath(program.opts().db);
      const db = openDatabase(dbPath);

      const { startServer } = await import("../server/start.js");
      const port = parseInt(options.port, 10);

      startServer({ db, port, dev: options.dev });

      console.log(`Database: ${dbPath}`);
    });
}
