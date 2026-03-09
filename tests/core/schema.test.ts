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
  setAiContext,
  getAiContext,
  clearAiContext,
  setAlias,
  renameColumn,
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

  it("throws on column name with special characters", () => {
    expect(() => parseColumnDef('na"me:text')).toThrow(KuraError);
    expect(() => parseColumnDef('na"me:text')).toThrow("Invalid column name");
  });

  it("throws on column name with semicolon", () => {
    expect(() => parseColumnDef("name;--:text")).toThrow(KuraError);
    expect(() => parseColumnDef("name;--:text")).toThrow("Invalid column name");
  });

  it("throws on column name with single quote", () => {
    expect(() => parseColumnDef("name':text")).toThrow(KuraError);
    expect(() => parseColumnDef("name':text")).toThrow("Invalid column name");
  });

  it("throws on column name starting with number", () => {
    expect(() => parseColumnDef("1name:text")).toThrow(KuraError);
    expect(() => parseColumnDef("1name:text")).toThrow("Invalid column name");
  });

  it("throws on reserved column name id", () => {
    expect(() => parseColumnDef("id:int")).toThrow(KuraError);
    expect(() => parseColumnDef("id:int")).toThrow("reserved column name");
  });

  it("throws on reserved column name created_at", () => {
    expect(() => parseColumnDef("created_at:text")).toThrow(KuraError);
    expect(() => parseColumnDef("created_at:text")).toThrow("reserved column name");
  });

  it("throws on reserved column name updated_at", () => {
    expect(() => parseColumnDef("updated_at:text")).toThrow(KuraError);
    expect(() => parseColumnDef("updated_at:text")).toThrow("reserved column name");
  });

  it("allows column name with underscores", () => {
    const col = parseColumnDef("first_name:text");
    expect(col.name).toBe("first_name");
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

  it("throws on table name with SQL injection characters", () => {
    expect(() =>
      createTable(db, "test';--", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
    expect(() =>
      createTable(db, "test';--", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow("Invalid table name");
  });

  it("throws on table name with double quote", () => {
    expect(() =>
      createTable(db, 'test"drop', [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("throws on table name with hyphen", () => {
    expect(() =>
      createTable(db, "my-table", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("throws on table name starting with number", () => {
    expect(() =>
      createTable(db, "123table", [{ name: "name", type: "text", position: 0 }]),
    ).toThrow(KuraError);
  });

  it("allows table name with underscores", () => {
    createTable(db, "my_table", [{ name: "name", type: "text", position: 0 }]);
    expect(tableExists(db, "my_table")).toBe(true);
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

// ============================================================
// AI Context
// ============================================================

describe("setAiContext / getAiContext / clearAiContext", () => {
  it("sets and gets database-level context", () => {
    setAiContext(db, "database", "Recruitment DB for HR team");
    const info = getAiContext(db);
    expect(info.database).toBe("Recruitment DB for HR team");
  });

  it("sets and gets table-level context", () => {
    createTable(db, "candidates", [{ name: "name", type: "text", position: 0 }]);
    setAiContext(db, "table", "One row per candidate", "candidates");
    const info = getAiContext(db, "candidates");
    expect(info.tables).toEqual([{ name: "candidates", aiContext: "One row per candidate" }]);
  });

  it("sets and gets column-level context", () => {
    createTable(db, "candidates", [
      { name: "name", type: "text", position: 0 },
      { name: "status", type: "text", position: 1 },
    ]);
    setAiContext(db, "column", "Selection status: applied → interview → offer/rejected", "candidates", "status");
    const info = getAiContext(db, "candidates");
    expect(info.columns).toEqual([
      { name: "status", aiContext: "Selection status: applied → interview → offer/rejected" },
    ]);
  });

  it("overwrites existing context", () => {
    setAiContext(db, "database", "Old description");
    setAiContext(db, "database", "New description");
    const info = getAiContext(db);
    expect(info.database).toBe("New description");
  });

  it("clears database-level context", () => {
    setAiContext(db, "database", "Some DB context");
    clearAiContext(db, "database");
    const info = getAiContext(db);
    expect(info.database).toBeUndefined();
  });

  it("clears table-level context", () => {
    createTable(db, "candidates", [{ name: "name", type: "text", position: 0 }]);
    setAiContext(db, "table", "Table context", "candidates");
    clearAiContext(db, "table", "candidates");
    const info = getAiContext(db, "candidates");
    expect(info.tables).toBeUndefined();
  });

  it("clears column-level context", () => {
    createTable(db, "candidates", [{ name: "status", type: "text", position: 0 }]);
    setAiContext(db, "column", "Status description", "candidates", "status");
    clearAiContext(db, "column", "candidates", "status");
    const info = getAiContext(db, "candidates");
    expect(info.columns).toBeUndefined();
  });

  it("throws on table context for non-existent table", () => {
    expect(() => setAiContext(db, "table", "ctx", "nope")).toThrow(KuraError);
  });

  it("throws on column context for non-existent column", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => setAiContext(db, "column", "ctx", "people", "missing")).toThrow(KuraError);
  });

  it("includes ai_context in describeTable", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);
    setAiContext(db, "table", "People table", "people");
    setAiContext(db, "column", "Full name", "people", "name");

    const info = describeTable(db, "people");
    expect(info.aiContext).toBe("People table");
    expect(info.columns[0].aiContext).toBe("Full name");
    expect(info.columns[1].aiContext).toBeUndefined();
  });

  it("includes ai_context in listTables", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAiContext(db, "table", "People table", "people");

    const tables = listTables(db);
    const people = tables.find((t) => t.name === "people");
    expect(people?.aiContext).toBe("People table");
  });

  it("getAiContext without table returns all table contexts", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    createTable(db, "companies", [{ name: "name", type: "text", position: 0 }]);
    setAiContext(db, "database", "Test DB");
    setAiContext(db, "table", "People", "people");
    setAiContext(db, "table", "Companies", "companies");

    const info = getAiContext(db);
    expect(info.database).toBe("Test DB");
    expect(info.tables).toHaveLength(2);
  });

  it("dropTable also removes table ai_context", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAiContext(db, "table", "People table", "people");
    dropTable(db, "people");

    const info = getAiContext(db);
    expect(info.tables).toBeUndefined();
  });
});

// ============================================================
// Alias
// ============================================================

describe("setAlias", () => {
  it("sets and gets table alias", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAlias(db, "table", "People Master", "people");

    const info = describeTable(db, "people");
    expect(info.alias).toBe("People Master");
  });

  it("clears table alias with null", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAlias(db, "table", "People", "people");
    setAlias(db, "table", null, "people");

    const info = describeTable(db, "people");
    expect(info.alias).toBeUndefined();
  });

  it("sets and gets column alias", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAlias(db, "column", "Full Name", "people", "name");

    const info = describeTable(db, "people");
    expect(info.columns[0].alias).toBe("Full Name");
  });

  it("includes alias in listTables", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAlias(db, "table", "People Master", "people");

    const tables = listTables(db);
    const people = tables.find((t) => t.name === "people");
    expect(people?.alias).toBe("People Master");
  });

  it("throws on non-existent table", () => {
    expect(() => setAlias(db, "table", "test", "nope")).toThrow(KuraError);
  });

  it("throws on non-existent column", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => setAlias(db, "column", "test", "people", "missing")).toThrow(KuraError);
  });

  it("dropTable also removes table alias", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    setAlias(db, "table", "People", "people");
    dropTable(db, "people");

    // Create again and verify no alias
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    const info = describeTable(db, "people");
    expect(info.alias).toBeUndefined();
  });
});

// ============================================================
// renameColumn
// ============================================================

describe("renameColumn", () => {
  it("renames a column", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);

    renameColumn(db, "people", "name", "full_name");

    const info = describeTable(db, "people");
    expect(info.columns[0].name).toBe("full_name");
    expect(info.columns[1].name).toBe("age");
  });

  it("updates relation_display references", () => {
    createTable(db, "companies", [{ name: "title", type: "text", position: 0 }]);
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "company", type: "relation", relationTarget: "companies", relationDisplay: "title", position: 1 },
    ]);

    renameColumn(db, "companies", "title", "company_name");

    const info = describeTable(db, "people");
    const companyCol = info.columns.find((c) => c.name === "company");
    expect(companyCol?.relationDisplay).toBe("company_name");
  });

  it("throws on non-existent table", () => {
    expect(() => renameColumn(db, "nope", "x", "y")).toThrow(KuraError);
  });

  it("throws on non-existent column", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => renameColumn(db, "people", "missing", "new_name")).toThrow(KuraError);
  });

  it("throws on invalid new name", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => renameColumn(db, "people", "name", "1invalid")).toThrow(KuraError);
  });

  it("throws on reserved new name", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    expect(() => renameColumn(db, "people", "name", "id")).toThrow(KuraError);
  });

  it("throws on duplicate name", () => {
    createTable(db, "people", [
      { name: "name", type: "text", position: 0 },
      { name: "age", type: "int", position: 1 },
    ]);
    expect(() => renameColumn(db, "people", "name", "age")).toThrow(KuraError);
  });

  it("preserves data after rename", () => {
    createTable(db, "people", [{ name: "name", type: "text", position: 0 }]);
    db.prepare('INSERT INTO people (name) VALUES (?)').run("Alice");

    renameColumn(db, "people", "name", "full_name");

    const row = db.prepare("SELECT full_name FROM people WHERE id = 1").get() as { full_name: string };
    expect(row.full_name).toBe("Alice");
  });
});
