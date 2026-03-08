import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase } from "../../src/core/database.js";
import {
  parseColumnDef,
  createTable,
  listTables,
  describeTable,
  addColumn,
  modifyColumn,
  dropTable,
  tableExists,
} from "../../src/core/schema.js";
import { KuraError } from "../../src/core/types.js";
import type Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
});

// ============================================================
// parseColumnDef
// ============================================================

describe("parseColumnDef", () => {
  it("parses text column", () => {
    const col = parseColumnDef("name:text");
    expect(col).toEqual({ name: "name", type: "text", position: 0 });
  });

  it("parses int column", () => {
    const col = parseColumnDef("age:int");
    expect(col).toEqual({ name: "age", type: "int", position: 0 });
  });

  it("parses real column", () => {
    const col = parseColumnDef("score:real");
    expect(col).toEqual({ name: "score", type: "real", position: 0 });
  });

  it("parses bool column", () => {
    const col = parseColumnDef("active:bool");
    expect(col).toEqual({ name: "active", type: "bool", position: 0 });
  });

  it("parses relation column", () => {
    const col = parseColumnDef("company:relation(companies)");
    expect(col).toEqual({
      name: "company",
      type: "relation",
      relationTarget: "companies",
      position: 0,
    });
  });

  it("parses relation[] column", () => {
    const col = parseColumnDef("tags:relation[](tags)");
    expect(col).toEqual({
      name: "tags",
      type: "relation[]",
      relationTarget: "tags",
      position: 0,
    });
  });

  it("throws on invalid format", () => {
    expect(() => parseColumnDef("invalid")).toThrow(KuraError);
  });

  it("throws on invalid type", () => {
    expect(() => parseColumnDef("name:unknown")).toThrow(KuraError);
    expect(() => parseColumnDef("name:unknown")).toThrow("Invalid column type");
  });
});

// ============================================================
// createTable
// ============================================================

describe("createTable", () => {
  it("creates a table with columns", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);

    expect(tableExists(db, "people")).toBe(true);

    // Verify table was actually created in SQLite
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get("people") as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe("people");
  });

  it("creates updated_at trigger", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);

    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
      .get("_kura_updated_people") as { name: string } | undefined;
    expect(trigger).toBeDefined();
  });

  it("stores metadata in _kura_meta", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);

    const meta = db
      .prepare("SELECT * FROM _kura_meta WHERE table_name = ? ORDER BY position")
      .all("people") as Array<{ column_name: string; column_type: string; position: number }>;

    expect(meta).toHaveLength(2);
    expect(meta[0].column_name).toBe("name");
    expect(meta[0].column_type).toBe("text");
    expect(meta[1].column_name).toBe("age");
    expect(meta[1].column_type).toBe("int");
  });

  it("throws on duplicate table", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() =>
      createTable(db, "people", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("throws on table name with spaces", () => {
    expect(() =>
      createTable(db, "my table", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("throws on table name starting with underscore", () => {
    expect(() =>
      createTable(db, "_private", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("throws on reserved table name", () => {
    expect(() =>
      createTable(db, "_kura_meta", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("creates table with relation columns", () => {
    createTable(db, "companies", [{ name: "name", type: "text", position: 0 }]);
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "company", type: "relation", relationTarget: "companies", position: 1 },
    ]);

    const meta = db
      .prepare("SELECT * FROM _kura_meta WHERE table_name = ? AND column_name = ?")
      .get("people", "company") as { relation_target: string };
    expect(meta.relation_target).toBe("companies");
  });
});

// ============================================================
// listTables
// ============================================================

describe("listTables", () => {
  it("returns empty list when no tables", () => {
    expect(listTables(db)).toEqual([]);
  });

  it("lists all tables with record counts", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    createTable(db, "companies", [{ name: "name", type: "text", position: 0 }]);

    // Insert a record into people
    db.prepare('INSERT INTO people (name) VALUES (?)').run("Alice");

    const tables = listTables(db);
    expect(tables).toHaveLength(2);

    const people = tables.find((t) => t.name === "people")!;
    expect(people.recordCount).toBe(1);
    expect(people.columns).toHaveLength(1);

    const companies = tables.find((t) => t.name === "companies")!;
    expect(companies.recordCount).toBe(0);
  });
});

// ============================================================
// describeTable
// ============================================================

describe("describeTable", () => {
  it("returns table info", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);

    const info = describeTable(db, "people");
    expect(info.name).toBe("people");
    expect(info.columns).toHaveLength(2);
    expect(info.columns[0].name).toBe("name");
    expect(info.columns[1].name).toBe("age");
    expect(info.recordCount).toBe(0);
  });

  it("throws on non-existent table", () => {
    expect(() => describeTable(db, "nope")).toThrow(KuraError);
  });
});

// ============================================================
// addColumn
// ============================================================

describe("addColumn", () => {
  it("adds a column to existing table", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);

    addColumn(db, "people", { name: "email", type: "text", position: 0 });

    const info = describeTable(db, "people");
    expect(info.columns).toHaveLength(2);
    expect(info.columns[1].name).toBe("email");
    expect(info.columns[1].position).toBe(1);
  });

  it("throws on non-existent table", () => {
    expect(() =>
      addColumn(db, "nope", { name: "email", type: "text", position: 0 }),
    ).toThrow(KuraError);
  });
});

// ============================================================
// modifyColumn
// ============================================================

describe("modifyColumn", () => {
  it("sets display type on a column", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);

    modifyColumn(db, "people", "name", "select");

    const info = describeTable(db, "people");
    expect(info.columns[0].displayType).toBe("select");
  });

  it("clears display type with null", () => {
    createTable(db, "people", [
      { name: "status", type: "text", displayType: "select", position: 0 },
    ]);

    modifyColumn(db, "people", "status", null);

    const info = describeTable(db, "people");
    expect(info.columns[0].displayType).toBeUndefined();
  });

  it("changes display type", () => {
    createTable(db, "items", [
      { name: "price", type: "int", displayType: "currency", position: 0 },
    ]);

    modifyColumn(db, "items", "price", "rating");

    const info = describeTable(db, "items");
    expect(info.columns[0].displayType).toBe("rating");
  });

  it("throws on non-existent table", () => {
    expect(() => modifyColumn(db, "nope", "name", "select")).toThrow(KuraError);
  });

  it("throws on non-existent column", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => modifyColumn(db, "people", "missing", "select")).toThrow(KuraError);
  });
});

// ============================================================
// dropTable
// ============================================================

describe("dropTable", () => {
  it("drops table, trigger, and metadata", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    dropTable(db, "people");

    expect(tableExists(db, "people")).toBe(false);

    // Verify table is gone from SQLite
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get("people");
    expect(row).toBeUndefined();

    // Verify trigger is gone
    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
      .get("_kura_updated_people");
    expect(trigger).toBeUndefined();

    // Verify metadata is gone
    const meta = db
      .prepare("SELECT COUNT(*) as count FROM _kura_meta WHERE table_name = ?")
      .get("people") as { count: number };
    expect(meta.count).toBe(0);
  });

  it("throws on non-existent table", () => {
    expect(() => dropTable(db, "nope")).toThrow(KuraError);
  });
});

// ============================================================
// tableExists
// ============================================================

describe("tableExists", () => {
  it("returns false for non-existent table", () => {
    expect(tableExists(db, "nope")).toBe(false);
  });

  it("returns true for existing table", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(tableExists(db, "people")).toBe(true);
  });
});
