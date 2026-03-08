import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  db: Database.Database;
  port?: number;
  dev?: boolean;
}

export function startServer(options: ServerOptions) {
  const { db, port = 51730, dev = false } = options;
  const app = createApp(db);

  // Serve static files in production mode
  if (!dev) {
    const uiRoot = path.join(__dirname, "ui");
    app.use("/*", serveStatic({ root: uiRoot }));
    // SPA fallback
    app.get("/*", serveStatic({ root: uiRoot, path: "index.html" }));
  }

  const server = serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`kura UI server running at http://localhost:${info.port}`);
    if (dev) {
      console.log("Dev mode: frontend at http://localhost:5173");
    }
  });

  return server;
}
