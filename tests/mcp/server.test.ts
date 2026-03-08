import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { openMemoryDatabase } from "../../src/core/database.js";
import { createTable, parseColumnDef, listTables, describeTable } from "../../src/core/schema.js";
import { addRecord, getRecord, listRecords, updateRecord, deleteRecord } from "../../src/core/records.js";
import { resolveRelations } from "../../src/core/relations.js";
import { search } from "../../src/core/search.js";
import { KuraError } from "../../src/core/types.js";

/**
 * These tests exercise the core functions that the MCP tools call,
 * using an in-memory database. This validates the logic without
 * needing to spin up the MCP stdio transport.
 */

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
});

describe("list_tables / describe_table", () => {
  it("returns empty list when no tables exist", () => {
    expect(listTables(db)).toEqual([]);
  });

  it("lists tables after creation", () => {
    createTable(db, "projects", [parseColumnDef("name:text")]);
    const tables = listTables(db);
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("projects");
    expect(tables[0].columns[0].name).toBe("name");
    expect(tables[0].columns[0].type).toBe("text");
  });

  it("describes a table with full schema", () => {
    createTable(db, "tasks", [
      parseColumnDef("title:text"),
      parseColumnDef("priority:int"),
    ]);
    const info = describeTable(db, "tasks");
    expect(info.name).toBe("tasks");
    expect(info.columns).toHaveLength(2);
    expect(info.columns[0]).toMatchObject({ name: "title", type: "text" });
    expect(info.columns[1]).toMatchObject({ name: "priority", type: "int" });
    expect(info.recordCount).toBe(0);
  });

  it("throws for non-existent table", () => {
    expect(() => describeTable(db, "nope")).toThrow(KuraError);
  });
});

describe("create_table", () => {
  it("creates a table with columns parsed from strings", () => {
    const cols = ["name:text", "age:int", "active:bool"].map(parseColumnDef);
    createTable(db, "people", cols);
    const info = describeTable(db, "people");
    expect(info.columns).toHaveLength(3);
  });

  it("creates a table with relation columns", () => {
    createTable(db, "companies", [parseColumnDef("name:text")]);
    createTable(db, "employees", [
      parseColumnDef("name:text"),
      parseColumnDef("company:relation(companies)"),
    ]);
    const info = describeTable(db, "employees");
    const companyCol = info.columns.find((c) => c.name === "company");
    expect(companyCol?.type).toBe("relation");
    expect(companyCol?.relationTarget).toBe("companies");
  });

  it("throws on duplicate table name", () => {
    createTable(db, "items", [parseColumnDef("name:text")]);
    expect(() => createTable(db, "items", [parseColumnDef("name:text")])).toThrow(KuraError);
  });
});

describe("add_record / get_record", () => {
  beforeEach(() => {
    createTable(db, "books", [
      parseColumnDef("title:text"),
      parseColumnDef("pages:int"),
    ]);
  });

  it("adds and retrieves a record", () => {
    const record = addRecord(db, "books", { title: "Dune", pages: 412 });
    expect(record.id).toBe(1);
    expect(record.data.title).toBe("Dune");
    expect(record.data.pages).toBe(412);

    const fetched = getRecord(db, "books", 1);
    expect(fetched.data.title).toBe("Dune");
  });

  it("throws when getting non-existent record", () => {
    expect(() => getRecord(db, "books", 999)).toThrow(KuraError);
  });
});

describe("list_records", () => {
  beforeEach(() => {
    createTable(db, "items", [
      parseColumnDef("name:text"),
      parseColumnDef("price:int"),
    ]);
    addRecord(db, "items", { name: "Apple", price: 100 });
    addRecord(db, "items", { name: "Banana", price: 200 });
    addRecord(db, "items", { name: "Cherry", price: 150 });
  });

  it("lists all records", () => {
    const records = listRecords(db, "items");
    expect(records).toHaveLength(3);
  });

  it("filters with where", () => {
    const records = listRecords(db, "items", { where: { name: "Banana" } });
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe("Banana");
  });

  it("sorts records", () => {
    const records = listRecords(db, "items", { sort: "-price" });
    expect(records[0].data.name).toBe("Banana");
    expect(records[2].data.name).toBe("Apple");
  });

  it("limits results", () => {
    const records = listRecords(db, "items", { limit: 2 });
    expect(records).toHaveLength(2);
  });
});

describe("update_record", () => {
  it("updates a record and returns the new data", () => {
    createTable(db, "notes", [parseColumnDef("text:text")]);
    addRecord(db, "notes", { text: "original" });
    const updated = updateRecord(db, "notes", 1, { text: "modified" });
    expect(updated.data.text).toBe("modified");
  });

  it("throws for non-existent record", () => {
    createTable(db, "notes", [parseColumnDef("text:text")]);
    expect(() => updateRecord(db, "notes", 999, { text: "x" })).toThrow(KuraError);
  });
});

describe("delete_record", () => {
  it("deletes a record", () => {
    createTable(db, "temp", [parseColumnDef("val:text")]);
    addRecord(db, "temp", { val: "x" });
    deleteRecord(db, "temp", 1);
    expect(() => getRecord(db, "temp", 1)).toThrow(KuraError);
  });

  it("throws for non-existent record", () => {
    createTable(db, "temp", [parseColumnDef("val:text")]);
    expect(() => deleteRecord(db, "temp", 999)).toThrow(KuraError);
  });
});

describe("resolveRelations", () => {
  it("resolves single relation to display value", () => {
    createTable(db, "departments", [parseColumnDef("name:text")]);
    createTable(db, "staff", [
      parseColumnDef("name:text"),
      parseColumnDef("dept:relation(departments)"),
    ]);
    addRecord(db, "departments", { name: "Engineering" });
    addRecord(db, "staff", { name: "Alice", dept: 1 });

    const records = listRecords(db, "staff");
    const resolved = resolveRelations(db, "staff", records);
    expect(resolved[0].data.dept).toBe("Engineering");
  });

  it("resolves relation[] to comma-separated values", () => {
    createTable(db, "tags", [parseColumnDef("label:text")]);
    createTable(db, "posts", [
      parseColumnDef("title:text"),
      parseColumnDef("tags:relation[](tags)"),
    ]);
    addRecord(db, "tags", { label: "typescript" });
    addRecord(db, "tags", { label: "node" });
    addRecord(db, "posts", { title: "My Post", tags: "[1,2]" });

    const records = listRecords(db, "posts");
    const resolved = resolveRelations(db, "posts", records);
    expect(resolved[0].data.tags).toBe("typescript, node");
  });
});

describe("search", () => {
  it("finds records by text content", () => {
    createTable(db, "articles", [
      parseColumnDef("title:text"),
      parseColumnDef("body:text"),
    ]);
    addRecord(db, "articles", { title: "TypeScript Guide", body: "Learn TS basics" });
    addRecord(db, "articles", { title: "Python Intro", body: "Learn Python basics" });

    const results = search(db, "TypeScript");
    expect(results).toHaveLength(1);
    expect(results[0].table).toBe("articles");
    expect(results[0].id).toBe(1);
  });

  it("searches specific table only", () => {
    createTable(db, "docs", [parseColumnDef("content:text")]);
    createTable(db, "notes", [parseColumnDef("content:text")]);
    addRecord(db, "docs", { content: "hello world" });
    addRecord(db, "notes", { content: "hello world" });

    const results = search(db, "hello", ["docs"]);
    expect(results).toHaveLength(1);
    expect(results[0].table).toBe("docs");
  });
});

describe("run_query (raw SQL)", () => {
  it("executes SELECT queries", () => {
    createTable(db, "data", [parseColumnDef("value:int")]);
    addRecord(db, "data", { value: 42 });
    const rows = db.prepare('SELECT value FROM "data"').all() as Array<{ value: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(42);
  });

  it("executes non-SELECT statements", () => {
    createTable(db, "data", [parseColumnDef("value:int")]);
    addRecord(db, "data", { value: 1 });
    db.exec('UPDATE "data" SET value = 99 WHERE id = 1');
    const record = getRecord(db, "data", 1);
    expect(record.data.value).toBe(99);
  });
});
