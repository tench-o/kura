import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase } from "../../src/core/database.js";
import { createTable } from "../../src/core/schema.js";
import {
  addRecord,
  getRecord,
  listRecords,
  updateRecord,
  deleteRecord,
  countRecords,
  coerceValue,
  rowToRecord,
  buildFilterSQL,
} from "../../src/core/records.js";
import { KuraError } from "../../src/core/types.js";
import type Database from "better-sqlite3";

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
  createTable(db, "people", [
    { name: "name", type: "text", position: 0 },
    { name: "age", type: "int", position: 1 },
    { name: "active", type: "bool", position: 2 },
  ]);
});

// ============================================================
// coerceValue
// ============================================================

describe("coerceValue", () => {
  it("coerces boolean true to 1", () => {
    expect(coerceValue(true, "bool")).toBe(1);
  });

  it("coerces boolean false to 0", () => {
    expect(coerceValue(false, "bool")).toBe(0);
  });

  it("coerces string 'true' to 1", () => {
    expect(coerceValue("true", "bool")).toBe(1);
  });

  it("coerces string 'false' to 0", () => {
    expect(coerceValue("false", "bool")).toBe(0);
  });

  it("coerces string to int", () => {
    expect(coerceValue("42", "int")).toBe(42);
  });

  it("coerces string to real", () => {
    expect(coerceValue("3.14", "real")).toBe(3.14);
  });

  it("returns null for null", () => {
    expect(coerceValue(null, "text")).toBeNull();
  });

  it("coerces number to string for text type", () => {
    expect(coerceValue(42, "text")).toBe("42");
  });

  it("keeps JSON string for relation[]", () => {
    expect(coerceValue("[1,2,3]", "relation[]")).toBe("[1,2,3]");
  });
});

// ============================================================
// rowToRecord
// ============================================================

describe("rowToRecord", () => {
  it("extracts id, timestamps, and data", () => {
    const record = rowToRecord({
      id: 1,
      name: "Alice",
      age: 30,
      created_at: "2024-01-01 00:00:00",
      updated_at: "2024-01-01 00:00:00",
    });

    expect(record.id).toBe(1);
    expect(record.data).toEqual({ name: "Alice", age: 30 });
    expect(record.created_at).toBe("2024-01-01 00:00:00");
    expect(record.updated_at).toBe("2024-01-01 00:00:00");
  });
});

// ============================================================
// addRecord
// ============================================================

describe("addRecord", () => {
  it("inserts a record and returns it", () => {
    const record = addRecord(db, "people", { name: "Alice", age: 30, active: true });

    expect(record.id).toBe(1);
    expect(record.data.name).toBe("Alice");
    expect(record.data.age).toBe(30);
    expect(record.data.active).toBe(1); // bool coerced
    expect(record.created_at).toBeDefined();
    expect(record.updated_at).toBeDefined();
  });

  it("auto-increments id", () => {
    const r1 = addRecord(db, "people", { name: "Alice", age: 30, active: true });
    const r2 = addRecord(db, "people", { name: "Bob", age: 25, active: false });

    expect(r1.id).toBe(1);
    expect(r2.id).toBe(2);
  });

  it("throws on non-existent table", () => {
    expect(() => addRecord(db, "nope", { name: "Alice" })).toThrow(KuraError);
  });

  it("ignores unknown columns", () => {
    const record = addRecord(db, "people", {
      name: "Alice",
      age: 30,
      active: true,
      unknown: "ignored",
    });
    expect(record.data).not.toHaveProperty("unknown");
  });

  it("throws when no valid columns", () => {
    expect(() => addRecord(db, "people", { unknown: "value" })).toThrow(KuraError);
  });
});

// ============================================================
// getRecord
// ============================================================

describe("getRecord", () => {
  it("returns a record by id", () => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    const record = getRecord(db, "people", 1);

    expect(record.id).toBe(1);
    expect(record.data.name).toBe("Alice");
  });

  it("throws on non-existent record", () => {
    expect(() => getRecord(db, "people", 999)).toThrow(KuraError);
    expect(() => getRecord(db, "people", 999)).toThrow("not found");
  });

  it("throws on non-existent table", () => {
    expect(() => getRecord(db, "nope", 1)).toThrow(KuraError);
  });
});

// ============================================================
// listRecords
// ============================================================

describe("listRecords", () => {
  beforeEach(() => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    addRecord(db, "people", { name: "Bob", age: 25, active: true });
    addRecord(db, "people", { name: "Charlie", age: 35, active: false });
  });

  it("lists all records", () => {
    const records = listRecords(db, "people");
    expect(records).toHaveLength(3);
  });

  it("filters with where", () => {
    const records = listRecords(db, "people", { where: { name: "Alice" } });
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe("Alice");
  });

  it("sorts ascending", () => {
    const records = listRecords(db, "people", { sort: "age" });
    expect(records[0].data.name).toBe("Bob");
    expect(records[2].data.name).toBe("Charlie");
  });

  it("sorts descending", () => {
    const records = listRecords(db, "people", { sort: "-age" });
    expect(records[0].data.name).toBe("Charlie");
    expect(records[2].data.name).toBe("Bob");
  });

  it("applies limit", () => {
    const records = listRecords(db, "people", { limit: 2 });
    expect(records).toHaveLength(2);
  });

  it("applies offset", () => {
    const records = listRecords(db, "people", { limit: 1, offset: 1 });
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe("Bob");
  });

  it("throws on non-existent table", () => {
    expect(() => listRecords(db, "nope")).toThrow(KuraError);
  });
});

// ============================================================
// updateRecord
// ============================================================

describe("updateRecord", () => {
  it("updates a record", () => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    const updated = updateRecord(db, "people", 1, { age: 31 });

    expect(updated.data.age).toBe(31);
    expect(updated.data.name).toBe("Alice"); // unchanged
  });

  it("throws on non-existent record", () => {
    expect(() => updateRecord(db, "people", 999, { name: "X" })).toThrow(KuraError);
  });

  it("throws on non-existent table", () => {
    expect(() => updateRecord(db, "nope", 1, { name: "X" })).toThrow(KuraError);
  });

  it("ignores unknown columns", () => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    // Should not throw — just ignores unknown column, but since no valid columns it will throw
    expect(() => updateRecord(db, "people", 1, { unknown: "value" })).toThrow(KuraError);
  });
});

// ============================================================
// deleteRecord
// ============================================================

describe("deleteRecord", () => {
  it("deletes a record", () => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    deleteRecord(db, "people", 1);

    expect(() => getRecord(db, "people", 1)).toThrow(KuraError);
    expect(countRecords(db, "people")).toBe(0);
  });

  it("throws on non-existent record", () => {
    expect(() => deleteRecord(db, "people", 999)).toThrow(KuraError);
  });

  it("throws on non-existent table", () => {
    expect(() => deleteRecord(db, "nope", 1)).toThrow(KuraError);
  });
});

// ============================================================
// countRecords
// ============================================================

describe("countRecords", () => {
  it("returns 0 for empty table", () => {
    expect(countRecords(db, "people")).toBe(0);
  });

  it("returns correct count", () => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    addRecord(db, "people", { name: "Bob", age: 25, active: true });
    expect(countRecords(db, "people")).toBe(2);
  });

  it("throws on non-existent table", () => {
    expect(() => countRecords(db, "nope")).toThrow(KuraError);
  });
});

// ============================================================
// buildFilterSQL
// ============================================================

describe("buildFilterSQL", () => {
  it("builds eq clause", () => {
    const result = buildFilterSQL([{ column: "name", operator: "eq", value: "Alice" }]);
    expect(result.clauses).toEqual(['"name" = ?']);
    expect(result.params).toEqual(["Alice"]);
  });

  it("builds contains clause with LIKE", () => {
    const result = buildFilterSQL([{ column: "name", operator: "contains", value: "li" }]);
    expect(result.clauses).toEqual(['"name" LIKE ?']);
    expect(result.params).toEqual(["%li%"]);
  });

  it("builds is_empty clause without params", () => {
    const result = buildFilterSQL([{ column: "name", operator: "is_empty", value: "" }]);
    expect(result.clauses).toEqual(['("name" IS NULL OR "name" = \'\')']);
    expect(result.params).toEqual([]);
  });

  it("builds is_not_empty clause without params", () => {
    const result = buildFilterSQL([{ column: "name", operator: "is_not_empty", value: "" }]);
    expect(result.clauses).toEqual(['("name" IS NOT NULL AND "name" != \'\')']);
    expect(result.params).toEqual([]);
  });

  it("builds multiple conditions", () => {
    const result = buildFilterSQL([
      { column: "name", operator: "contains", value: "A" },
      { column: "age", operator: "gt", value: "20" },
    ]);
    expect(result.clauses).toHaveLength(2);
    expect(result.params).toHaveLength(2);
  });
});

// ============================================================
// listRecords with filters
// ============================================================

describe("listRecords with filters", () => {
  beforeEach(() => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    addRecord(db, "people", { name: "Bob", age: 25, active: true });
    addRecord(db, "people", { name: "Charlie", age: 35, active: false });
  });

  it("filters with eq", () => {
    const records = listRecords(db, "people", {
      filters: [{ column: "name", operator: "eq", value: "Alice" }],
    });
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe("Alice");
  });

  it("filters with neq", () => {
    const records = listRecords(db, "people", {
      filters: [{ column: "name", operator: "neq", value: "Alice" }],
    });
    expect(records).toHaveLength(2);
  });

  it("filters with gt", () => {
    const records = listRecords(db, "people", {
      filters: [{ column: "age", operator: "gt", value: "25" }],
    });
    expect(records).toHaveLength(2);
  });

  it("filters with contains", () => {
    const records = listRecords(db, "people", {
      filters: [{ column: "name", operator: "contains", value: "li" }],
    });
    expect(records).toHaveLength(2); // Alice, Charlie
  });

  it("filters with not_contains", () => {
    const records = listRecords(db, "people", {
      filters: [{ column: "name", operator: "not_contains", value: "li" }],
    });
    expect(records).toHaveLength(1); // Bob
    expect(records[0].data.name).toBe("Bob");
  });

  it("combines where and filters with AND", () => {
    const records = listRecords(db, "people", {
      where: { active: "1" },
      filters: [{ column: "age", operator: "gte", value: "30" }],
    });
    expect(records).toHaveLength(1);
    expect(records[0].data.name).toBe("Alice");
  });

  it("combines multiple filters with AND", () => {
    const records = listRecords(db, "people", {
      filters: [
        { column: "age", operator: "gte", value: "25" },
        { column: "age", operator: "lt", value: "35" },
      ],
    });
    expect(records).toHaveLength(2); // Alice(30), Bob(25)
  });
});

// ============================================================
// listRecords column validation
// ============================================================

describe("listRecords column validation", () => {
  beforeEach(() => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
  });

  it("throws on non-existent column in where", () => {
    expect(() =>
      listRecords(db, "people", { where: { nonexistent: "value" } }),
    ).toThrow(KuraError);
    expect(() =>
      listRecords(db, "people", { where: { nonexistent: "value" } }),
    ).toThrow('Column "nonexistent" not found');
  });

  it("throws on non-existent column in filters", () => {
    expect(() =>
      listRecords(db, "people", {
        filters: [{ column: "evil", operator: "eq", value: "x" }],
      }),
    ).toThrow(KuraError);
    expect(() =>
      listRecords(db, "people", {
        filters: [{ column: "evil", operator: "eq", value: "x" }],
      }),
    ).toThrow('Column "evil" not found');
  });

  it("throws on non-existent column in sort", () => {
    expect(() =>
      listRecords(db, "people", { sort: "nonexistent" }),
    ).toThrow(KuraError);
    expect(() =>
      listRecords(db, "people", { sort: "nonexistent" }),
    ).toThrow('Column "nonexistent" not found');
  });

  it("throws on non-existent column in descending sort", () => {
    expect(() =>
      listRecords(db, "people", { sort: "-nonexistent" }),
    ).toThrow(KuraError);
  });

  it("allows sort by built-in columns (id, created_at, updated_at)", () => {
    const records = listRecords(db, "people", { sort: "id" });
    expect(records).toHaveLength(1);
    const records2 = listRecords(db, "people", { sort: "-created_at" });
    expect(records2).toHaveLength(1);
  });
});

// ============================================================
// countRecords with filters
// ============================================================

describe("countRecords with filters", () => {
  beforeEach(() => {
    addRecord(db, "people", { name: "Alice", age: 30, active: true });
    addRecord(db, "people", { name: "Bob", age: 25, active: true });
    addRecord(db, "people", { name: "Charlie", age: 35, active: false });
  });

  it("counts with filters", () => {
    const count = countRecords(db, "people", {
      filters: [{ column: "age", operator: "gt", value: "25" }],
    });
    expect(count).toBe(2);
  });

  it("counts with where and filters", () => {
    const count = countRecords(db, "people", {
      where: { active: "1" },
      filters: [{ column: "age", operator: "gte", value: "30" }],
    });
    expect(count).toBe(1);
  });

  it("counts without options (backward compatible)", () => {
    const count = countRecords(db, "people");
    expect(count).toBe(3);
  });

  it("throws on non-existent column in where", () => {
    expect(() =>
      countRecords(db, "people", { where: { nonexistent: "value" } }),
    ).toThrow(KuraError);
    expect(() =>
      countRecords(db, "people", { where: { nonexistent: "value" } }),
    ).toThrow('Column "nonexistent" not found');
  });

  it("throws on non-existent column in filters", () => {
    expect(() =>
      countRecords(db, "people", {
        filters: [{ column: "evil", operator: "eq", value: "x" }],
      }),
    ).toThrow(KuraError);
  });
});

// ============================================================
// Relation columns
// ============================================================

describe("relation columns", () => {
  beforeEach(() => {
    createTable(db, "companies", [{ name: "name", type: "text", position: 0 }]);
    createTable(db, "tags", [{ name: "label", type: "text", position: 0 }]);
    createTable(db, "employees", [
      { name: "name", type: "text", position: 0 },
      { name: "company", type: "relation", relationTarget: "companies", position: 1 },
      { name: "tags", type: "relation[]", relationTarget: "tags", position: 2 },
    ]);

    addRecord(db, "companies", { name: "Acme" });
    addRecord(db, "tags", { label: "dev" });
    addRecord(db, "tags", { label: "senior" });
  });

  it("stores relation as integer", () => {
    const record = addRecord(db, "employees", {
      name: "Alice",
      company: 1,
      tags: "[1,2]",
    });
    expect(record.data.company).toBe(1);
    expect(record.data.tags).toBe("[1,2]");
  });

  it("coerces relation string to integer", () => {
    const record = addRecord(db, "employees", {
      name: "Bob",
      company: "1" as any,
      tags: "[1]",
    });
    expect(record.data.company).toBe(1);
  });
});
