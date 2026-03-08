import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase } from "../../src/core/database.js";
import {
  resolveRelations,
  getDisplayColumn,
  resolveRelationValue,
} from "../../src/core/relations.js";
import type Database from "better-sqlite3";
import type { KuraRecord } from "../../src/core/types.js";

describe("relations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDatabase();

    // Create companies table
    db.exec(`
      CREATE TABLE companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, position) VALUES ('companies', 'name', 'text', 0)`,
    );
    db.exec(`INSERT INTO companies (name) VALUES ('Acme Corp')`);
    db.exec(`INSERT INTO companies (name) VALUES ('Globex Inc')`);

    // Create tags table
    db.exec(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, position) VALUES ('tags', 'name', 'text', 0)`,
    );
    db.exec(`INSERT INTO tags (name) VALUES ('typescript')`);
    db.exec(`INSERT INTO tags (name) VALUES ('golang')`);
    db.exec(`INSERT INTO tags (name) VALUES ('rust')`);

    // Create candidates table with relation and relation[] columns
    db.exec(`
      CREATE TABLE candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        company INTEGER,
        tags TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, relation_target, relation_display, position)
       VALUES ('candidates', 'name', 'text', NULL, NULL, 0)`,
    );
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, relation_target, relation_display, position)
       VALUES ('candidates', 'company', 'relation', 'companies', 'name', 1)`,
    );
    db.exec(
      `INSERT INTO _kura_meta (table_name, column_name, column_type, relation_target, relation_display, position)
       VALUES ('candidates', 'tags', 'relation[]', 'tags', 'name', 2)`,
    );

    db.exec(
      `INSERT INTO candidates (name, company, tags) VALUES ('Alice', 1, '[1,2]')`,
    );
    db.exec(
      `INSERT INTO candidates (name, company, tags) VALUES ('Bob', 2, '[3]')`,
    );
    db.exec(
      `INSERT INTO candidates (name, company, tags) VALUES ('Charlie', NULL, NULL)`,
    );
  });

  describe("getDisplayColumn", () => {
    it("returns explicit relation_display when set", () => {
      const result = getDisplayColumn(db, "candidates", "company");
      expect(result).toBe("name");
    });

    it("returns first text column of target when relation_display is not set", () => {
      // Remove explicit relation_display
      db.exec(
        `UPDATE _kura_meta SET relation_display = NULL WHERE table_name = 'candidates' AND column_name = 'company'`,
      );
      const result = getDisplayColumn(db, "candidates", "company");
      expect(result).toBe("name"); // first text column of companies
    });

    it('falls back to "id" when no text columns exist in target', () => {
      // Create a table with only numeric columns
      db.exec(`
        CREATE TABLE numbers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          value INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(
        `INSERT INTO _kura_meta (table_name, column_name, column_type, position) VALUES ('numbers', 'value', 'int', 0)`,
      );
      db.exec(
        `INSERT INTO _kura_meta (table_name, column_name, column_type, relation_target, relation_display, position)
         VALUES ('candidates', 'number_ref', 'relation', 'numbers', NULL, 3)`,
      );
      const result = getDisplayColumn(db, "candidates", "number_ref");
      expect(result).toBe("id");
    });
  });

  describe("resolveRelationValue", () => {
    it("resolves a single ID to its display value", () => {
      const result = resolveRelationValue(db, "companies", "name", 1);
      expect(result).toBe("Acme Corp");
    });

    it("returns null for non-existent ID", () => {
      const result = resolveRelationValue(db, "companies", "name", 999);
      expect(result).toBeNull();
    });
  });

  describe("resolveRelations", () => {
    function makeRecords(): KuraRecord[] {
      const rows = db
        .prepare("SELECT * FROM candidates ORDER BY id")
        .all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: r.id as number,
        data: {
          name: r.name as string,
          company: r.company as number | null,
          tags: r.tags as string | null,
        },
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      }));
    }

    it("resolves relation columns to display values", () => {
      const records = makeRecords();
      const resolved = resolveRelations(db, "candidates", records);

      expect(resolved[0].data.company).toBe("Acme Corp");
      expect(resolved[1].data.company).toBe("Globex Inc");
    });

    it("resolves relation[] columns to comma-separated display values", () => {
      const records = makeRecords();
      const resolved = resolveRelations(db, "candidates", records);

      expect(resolved[0].data.tags).toBe("typescript, golang");
      expect(resolved[1].data.tags).toBe("rust");
    });

    it("handles null relation values", () => {
      const records = makeRecords();
      const resolved = resolveRelations(db, "candidates", records);

      expect(resolved[2].data.company).toBeNull();
      expect(resolved[2].data.tags).toBeNull();
    });

    it("handles orphaned references (ID that no longer exists)", () => {
      db.exec(
        `INSERT INTO candidates (name, company, tags) VALUES ('Dan', 999, '[888,999]')`,
      );
      const records = makeRecords();
      const resolved = resolveRelations(db, "candidates", records);

      // Orphaned single relation
      const dan = resolved.find((r) => r.data.name === "Dan")!;
      expect(dan.data.company).toBeNull();
      // Orphaned relation[] — all IDs are orphaned, so empty string
      expect(dan.data.tags).toBe("");
    });

    it("does not mutate original records", () => {
      const records = makeRecords();
      const originalCompany = records[0].data.company;
      resolveRelations(db, "candidates", records);
      expect(records[0].data.company).toBe(originalCompany);
    });

    it("returns empty array for empty input", () => {
      const resolved = resolveRelations(db, "candidates", []);
      expect(resolved).toEqual([]);
    });

    it("returns copies when table has no relation columns", () => {
      const rows = db.prepare("SELECT * FROM companies ORDER BY id").all() as Array<
        Record<string, unknown>
      >;
      const records: KuraRecord[] = rows.map((r) => ({
        id: r.id as number,
        data: { name: r.name as string },
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      }));

      const resolved = resolveRelations(db, "companies", records);
      expect(resolved[0].data.name).toBe("Acme Corp");
      // Should be a copy, not the same reference
      expect(resolved[0]).not.toBe(records[0]);
    });
  });
});
