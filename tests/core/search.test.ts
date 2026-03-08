import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase } from "../../src/core/database.js";
import { ensureFTS, search, rebuildFTS } from "../../src/core/search.js";
import type Database from "better-sqlite3";

describe("search", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDatabase();

    // Create articles table
    db.exec(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        body TEXT,
        views INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
       VALUES ('articles', 'title', 'text', 0)`,
    );
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
       VALUES ('articles', 'body', 'text', 1)`,
    );
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
       VALUES ('articles', 'views', 'int', 2)`,
    );

    db.exec(
      `INSERT INTO articles (title, body, views) VALUES ('Getting Started with TypeScript', 'TypeScript is a typed superset of JavaScript.', 100)`,
    );
    db.exec(
      `INSERT INTO articles (title, body, views) VALUES ('Advanced Rust Patterns', 'Rust offers memory safety without garbage collection.', 200)`,
    );
    db.exec(
      `INSERT INTO articles (title, body, views) VALUES ('Go Concurrency', 'Goroutines make concurrent programming easy.', 150)`,
    );
  });

  describe("ensureFTS", () => {
    it("creates FTS5 virtual table for text columns", () => {
      ensureFTS(db, "articles");

      const ftsTable = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_kura_fts_articles'`,
        )
        .get() as { name: string } | undefined;

      expect(ftsTable).toBeDefined();
      expect(ftsTable!.name).toBe("_kura_fts_articles");
    });

    it("creates sync triggers", () => {
      ensureFTS(db, "articles");

      const triggers = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '_kura_fts_%_articles'`,
        )
        .all() as Array<{ name: string }>;

      const triggerNames = triggers.map((t) => t.name);
      expect(triggerNames).toContain("_kura_fts_ai_articles");
      expect(triggerNames).toContain("_kura_fts_au_articles");
      expect(triggerNames).toContain("_kura_fts_ad_articles");
    });

    it("is idempotent — calling twice does not error", () => {
      ensureFTS(db, "articles");
      expect(() => ensureFTS(db, "articles")).not.toThrow();
    });

    it("does nothing for tables with no text columns", () => {
      db.exec(`
        CREATE TABLE metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value REAL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(
        `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
         VALUES ('metrics', 'value', 'real', 0)`,
      );

      ensureFTS(db, "metrics");

      const ftsTable = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_kura_fts_metrics'`,
        )
        .get();

      expect(ftsTable).toBeUndefined();
    });

    it("populates FTS from existing data", () => {
      ensureFTS(db, "articles");

      const results = db
        .prepare(
          `SELECT rowid FROM _kura_fts_articles WHERE _kura_fts_articles MATCH 'TypeScript'`,
        )
        .all() as Array<{ rowid: number }>;

      expect(results.length).toBe(1);
      expect(results[0].rowid).toBe(1);
    });
  });

  describe("search", () => {
    it("finds records matching the query", () => {
      const results = search(db, "TypeScript");
      expect(results.length).toBe(1);
      expect(results[0].table).toBe("articles");
      expect(results[0].id).toBe(1);
      expect(results[0].snippet).toContain("TypeScript");
    });

    it("searches across multiple tables", () => {
      // Create a second table
      db.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(
        `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
         VALUES ('notes', 'content', 'text', 0)`,
      );
      db.exec(
        `INSERT INTO notes (content) VALUES ('Learning TypeScript basics')`,
      );

      const results = search(db, "TypeScript");
      expect(results.length).toBe(2);

      const tables = results.map((r) => r.table).sort();
      expect(tables).toEqual(["articles", "notes"]);
    });

    it("can limit search to specific tables", () => {
      // Create a second table with matching content
      db.exec(`
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(
        `INSERT INTO _kura_meta (table_name, column_name, column_type, position)
         VALUES ('notes', 'content', 'text', 0)`,
      );
      db.exec(
        `INSERT INTO notes (content) VALUES ('Learning TypeScript basics')`,
      );

      const results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(1);
      expect(results[0].table).toBe("articles");
    });

    it("returns empty array when nothing matches", () => {
      const results = search(db, "Python");
      expect(results).toEqual([]);
    });

    it("returns empty array for empty tables list", () => {
      const results = search(db, "TypeScript", []);
      expect(results).toEqual([]);
    });
  });

  describe("FTS sync triggers", () => {
    it("indexes newly inserted records", () => {
      ensureFTS(db, "articles");

      db.exec(
        `INSERT INTO articles (title, body, views) VALUES ('Python Guide', 'Python is versatile.', 50)`,
      );

      const results = search(db, "Python", ["articles"]);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(4);
    });

    it("updates FTS when record is updated", () => {
      ensureFTS(db, "articles");

      db.exec(
        `UPDATE articles SET title = 'Python Migration' WHERE id = 1`,
      );

      // Old title should no longer match
      const oldResults = search(db, "Getting Started", ["articles"]);
      expect(oldResults.length).toBe(0);

      // New title should match
      const newResults = search(db, "Python Migration", ["articles"]);
      expect(newResults.length).toBe(1);
      expect(newResults[0].id).toBe(1);
    });

    it("removes FTS entry when record is deleted", () => {
      ensureFTS(db, "articles");

      db.exec(`DELETE FROM articles WHERE id = 1`);

      const results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(0);
    });
  });

  describe("rebuildFTS", () => {
    it("drops and recreates FTS table", () => {
      ensureFTS(db, "articles");

      // Verify FTS works
      let results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(1);

      // Rebuild
      rebuildFTS(db, "articles");

      // FTS should still work after rebuild
      results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(1);
    });

    it("picks up data changes after rebuild", () => {
      ensureFTS(db, "articles");

      // Verify initial data is searchable
      let results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(1);

      // Rebuild FTS from scratch
      rebuildFTS(db, "articles");

      // All original data should still be searchable after rebuild
      results = search(db, "TypeScript", ["articles"]);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(1);

      // New inserts should work after rebuild (triggers recreated)
      db.exec(
        `INSERT INTO articles (title, body, views) VALUES ('New Article', 'Fresh content here.', 10)`,
      );
      results = search(db, "Fresh content", ["articles"]);
      expect(results.length).toBe(1);
    });
  });
});
