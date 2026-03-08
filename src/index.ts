import { Command } from "commander";
import { openDatabase, getDbPath } from "./core/database.js";
import { KuraError } from "./core/types.js";
import { registerTableCommand } from "./cli/table.js";
import { registerRecordCommands } from "./cli/records.js";
import { registerSearchCommand } from "./cli/search.js";
import { registerQueryCommand } from "./cli/query.js";
import { registerIoCommands } from "./cli/io.js";
import { registerUiCommand } from "./cli/ui.js";
import { displaySuccess, displayError } from "./cli/display.js";

const program = new Command();

program
  .name("kura")
  .version("0.1.0")
  .description("SQLite-based general-purpose local database CLI")
  .option("--db <name>", "Database name or path");

// Register subcommands
registerTableCommand(program);
registerRecordCommands(program);
registerSearchCommand(program);
registerQueryCommand(program);
registerIoCommands(program);
registerUiCommand(program);

// Init command
program
  .command("init")
  .description("Initialize a new database")
  .action(() => {
    const dbPath = getDbPath(program.opts().db);
    const db = openDatabase(dbPath);
    displaySuccess(`Database initialized at ${dbPath}`);
    db.close();
  });

// Serve command (MCP server)
program
  .command("serve")
  .description("Start MCP server")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/server.js");
    startMcpServer(program.opts().db);
  });

// Error handling wrapper
try {
  program.parse();
} catch (err) {
  if (err instanceof KuraError) {
    displayError(err.message);
  } else if (err instanceof Error) {
    displayError(err.message);
  } else {
    displayError("An unknown error occurred.");
  }
  process.exit(1);
}
