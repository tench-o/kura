import { describe, it, expect, beforeEach } from "vitest";
import { openMemoryDatabase } from "../../src/core/database.js";
import { createTable, parseColumnDef } from "../../src/core/schema.js";
import { addRecord } from "../../src/core/records.js";
import { createApp } from "../../src/server/app.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let app: ReturnType<typeof createApp>;

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function jsonReq(path: string, body: unknown, method = "POST") {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db = openMemoryDatabase();
  app = createApp(db);
});

describe("Tables API", () => {
  it("GET /api/tables returns empty list", async () => {
    const res = await req("/api/tables");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST /api/tables creates a table", async () => {
    const res = await jsonReq("/api/tables", {
      name: "users",
      columns: ["name:text", "age:int"],
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("GET /api/tables/:name returns table info", async () => {
    createTable(db, "users", [
      parseColumnDef("name:text"),
      parseColumnDef("age:int"),
    ]);

    const res = await req("/api/tables/users");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("users");
    expect(body.columns).toHaveLength(2);
  });

  it("GET /api/tables/:name returns 404 for missing table", async () => {
    const res = await req("/api/tables/nonexistent");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/tables/:name deletes table", async () => {
    createTable(db, "temp", [parseColumnDef("val:text")]);
    const res = await req("/api/tables/temp", { method: "DELETE" });
    expect(res.status).toBe(200);

    const res2 = await req("/api/tables/temp");
    expect(res2.status).toBe(404);
  });

  it("PATCH /api/tables/:name/columns/:column modifies display type", async () => {
    createTable(db, "users", [parseColumnDef("name:text"), parseColumnDef("age:int")]);

    const res = await jsonReq("/api/tables/users/columns/name", { display_type: "select" }, "PATCH");
    expect(res.status).toBe(200);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.columns[0].displayType).toBe("select");
  });

  it("PATCH /api/tables/:name/columns/:column clears display type", async () => {
    createTable(db, "users", [parseColumnDef("status:text/select")]);

    const res = await jsonReq("/api/tables/users/columns/status", { display_type: null }, "PATCH");
    expect(res.status).toBe(200);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.columns[0].displayType).toBeUndefined();
  });

  it("PATCH /api/tables/:name/columns/:column returns 404 for missing column", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    const res = await jsonReq("/api/tables/users/columns/missing", { display_type: "select" }, "PATCH");
    expect(res.status).toBe(400);
  });

  it("POST /api/tables/:name/columns adds column", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    const res = await jsonReq("/api/tables/users/columns", { column: "email:text" });
    expect(res.status).toBe(201);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.columns).toHaveLength(2);
  });
});

describe("Records API", () => {
  beforeEach(() => {
    createTable(db, "users", [
      parseColumnDef("name:text"),
      parseColumnDef("age:int"),
    ]);
  });

  it("POST /api/tables/:name/records creates record", async () => {
    const res = await jsonReq("/api/tables/users/records", {
      name: "Alice",
      age: 30,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.data.name).toBe("Alice");
  });

  it("GET /api/tables/:name/records lists records", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });
    addRecord(db, "users", { name: "Bob", age: 25 });

    const res = await req("/api/tables/users/records");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("GET /api/tables/:name/records supports sort", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });
    addRecord(db, "users", { name: "Bob", age: 25 });

    const res = await req("/api/tables/users/records?sort=-age");
    const body = await res.json();
    expect(body.records[0].data.name).toBe("Alice");
  });

  it("GET /api/tables/:name/records supports limit/offset", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });
    addRecord(db, "users", { name: "Bob", age: 25 });
    addRecord(db, "users", { name: "Carol", age: 35 });

    const res = await req("/api/tables/users/records?limit=2&offset=1");
    const body = await res.json();
    expect(body.records).toHaveLength(2);
    expect(body.records[0].data.name).toBe("Bob");
  });

  it("GET /api/tables/:name/records/:id returns record", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });

    const res = await req("/api/tables/users/records/1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record.data.name).toBe("Alice");
    expect(body.rawRecord.data.name).toBe("Alice");
  });

  it("GET /api/tables/:name/records/:id returns 404", async () => {
    const res = await req("/api/tables/users/records/999");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/tables/:name/records/:id updates record", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });

    const res = await jsonReq("/api/tables/users/records/1", { age: 31 }, "PATCH");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.age).toBe(31);
  });

  it("DELETE /api/tables/:name/records/:id deletes record", async () => {
    addRecord(db, "users", { name: "Alice", age: 30 });

    const res = await req("/api/tables/users/records/1", { method: "DELETE" });
    expect(res.status).toBe(200);

    const res2 = await req("/api/tables/users/records/1");
    expect(res2.status).toBe(404);
  });
});

describe("Filter API", () => {
  beforeEach(() => {
    createTable(db, "users", [
      parseColumnDef("name:text"),
      parseColumnDef("age:int"),
    ]);
    addRecord(db, "users", { name: "Alice", age: 30 });
    addRecord(db, "users", { name: "Bob", age: 25 });
    addRecord(db, "users", { name: "Charlie", age: 35 });
  });

  it("filters with eq operator", async () => {
    const filters = JSON.stringify([{ column: "name", operator: "eq", value: "Alice" }]);
    const res = await req(`/api/tables/users/records?filters=${encodeURIComponent(filters)}`);
    const body = await res.json();
    expect(body.records).toHaveLength(1);
    expect(body.records[0].data.name).toBe("Alice");
    expect(body.total).toBe(1);
  });

  it("filters with gt operator", async () => {
    const filters = JSON.stringify([{ column: "age", operator: "gt", value: "25" }]);
    const res = await req(`/api/tables/users/records?filters=${encodeURIComponent(filters)}`);
    const body = await res.json();
    expect(body.records).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("filters with contains operator", async () => {
    const filters = JSON.stringify([{ column: "name", operator: "contains", value: "li" }]);
    const res = await req(`/api/tables/users/records?filters=${encodeURIComponent(filters)}`);
    const body = await res.json();
    expect(body.records).toHaveLength(2); // Alice, Charlie
  });

  it("combines multiple filters", async () => {
    const filters = JSON.stringify([
      { column: "age", operator: "gte", value: "25" },
      { column: "age", operator: "lt", value: "35" },
    ]);
    const res = await req(`/api/tables/users/records?filters=${encodeURIComponent(filters)}`);
    const body = await res.json();
    expect(body.records).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("ignores invalid filters JSON", async () => {
    const res = await req("/api/tables/users/records?filters=invalid");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.records).toHaveLength(3);
  });

  it("total reflects filtered count for pagination", async () => {
    const filters = JSON.stringify([{ column: "name", operator: "eq", value: "Alice" }]);
    const res = await req(`/api/tables/users/records?limit=10&filters=${encodeURIComponent(filters)}`);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.records).toHaveLength(1);
  });
});

describe("Relations API", () => {
  it("resolves relations in list and get", async () => {
    createTable(db, "teams", [parseColumnDef("name:text")]);
    addRecord(db, "teams", { name: "Platform" });

    createTable(db, "members", [
      parseColumnDef("name:text"),
      parseColumnDef("team:relation(teams)"),
    ]);
    addRecord(db, "members", { name: "Alice", team: 1 });

    // List should resolve relation
    const listRes = await req("/api/tables/members/records");
    const listBody = await listRes.json();
    expect(listBody.records[0].data.team).toBe("Platform");
    expect(listBody.rawRecords[0].data.team).toBe(1);

    // Get should resolve relation
    const getRes = await req("/api/tables/members/records/1");
    const getBody = await getRes.json();
    expect(getBody.record.data.team).toBe("Platform");
    expect(getBody.rawRecord.data.team).toBe(1);
  });
});

describe("Alias API", () => {
  it("PUT /api/tables/:name/alias sets table alias", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    const res = await jsonReq("/api/tables/users/alias", { alias: "Users Master" }, "PUT");
    expect(res.status).toBe(200);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.alias).toBe("Users Master");
  });

  it("PUT /api/tables/:name/alias clears alias with null", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    await jsonReq("/api/tables/users/alias", { alias: "Test" }, "PUT");
    await jsonReq("/api/tables/users/alias", { alias: null }, "PUT");

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.alias).toBeUndefined();
  });

  it("PUT /api/tables/:name/columns/:column/alias sets column alias", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    const res = await jsonReq("/api/tables/users/columns/name/alias", { alias: "Full Name" }, "PUT");
    expect(res.status).toBe(200);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.columns[0].alias).toBe("Full Name");
  });

  it("alias appears in GET /api/tables list", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    await jsonReq("/api/tables/users/alias", { alias: "Users" }, "PUT");

    const res = await req("/api/tables");
    const body = await res.json();
    const users = body.find((t: { name: string }) => t.name === "users");
    expect(users.alias).toBe("Users");
  });
});

describe("Rename Column API", () => {
  it("PUT /api/tables/:name/columns/:column/rename renames column", async () => {
    createTable(db, "users", [parseColumnDef("name:text"), parseColumnDef("age:int")]);
    const res = await jsonReq("/api/tables/users/columns/name/rename", { name: "full_name" }, "PUT");
    expect(res.status).toBe(200);

    const desc = await req("/api/tables/users");
    const body = await desc.json();
    expect(body.columns[0].name).toBe("full_name");
  });

  it("rename returns 400 for invalid name", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);
    const res = await jsonReq("/api/tables/users/columns/name/rename", { name: "1invalid" }, "PUT");
    expect(res.status).toBe(400);
  });
});

describe("AI Context API", () => {
  it("PUT/GET/DELETE /api/tables/:name/ai-context manages context", async () => {
    createTable(db, "users", [parseColumnDef("name:text")]);

    // Set
    const setRes = await jsonReq("/api/tables/users/ai-context", { context: "User management table" }, "PUT");
    expect(setRes.status).toBe(200);

    // Get
    const getRes = await req("/api/tables/users/ai-context");
    const body = await getRes.json();
    expect(body.tables).toEqual([{ name: "users", aiContext: "User management table" }]);

    // Delete
    const delRes = await req("/api/tables/users/ai-context", { method: "DELETE" });
    expect(delRes.status).toBe(200);

    const getRes2 = await req("/api/tables/users/ai-context");
    const body2 = await getRes2.json();
    expect(body2.tables).toBeUndefined();
  });
});

describe("CSV Export API", () => {
  it("GET /api/tables/:name/export returns CSV", async () => {
    createTable(db, "users", [parseColumnDef("name:text"), parseColumnDef("age:int")]);
    addRecord(db, "users", { name: "Alice", age: 30 });
    addRecord(db, "users", { name: "Bob", age: 25 });

    const res = await req("/api/tables/users/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,name,age,created_at,updated_at");
    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[1]).toContain("Alice");
  });

  it("CSV escapes values with commas", async () => {
    createTable(db, "notes", [parseColumnDef("title:text")]);
    addRecord(db, "notes", { title: "Hello, World" });

    const res = await req("/api/tables/notes/export");
    const csv = await res.text();
    expect(csv).toContain('"Hello, World"');
  });
});

describe("Search API", () => {
  it("GET /api/search returns results", async () => {
    createTable(db, "notes", [parseColumnDef("title:text"), parseColumnDef("body:text")]);
    addRecord(db, "notes", { title: "Hello World", body: "This is a test note" });
    addRecord(db, "notes", { title: "Another Note", body: "Different content here" });

    const res = await req("/api/search?q=Hello");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].table).toBe("notes");
  });

  it("GET /api/search with empty query returns empty", async () => {
    const res = await req("/api/search?q=");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /api/search with table filter", async () => {
    createTable(db, "notes", [parseColumnDef("title:text")]);
    createTable(db, "tasks", [parseColumnDef("title:text")]);
    addRecord(db, "notes", { title: "Hello from notes" });
    addRecord(db, "tasks", { title: "Hello from tasks" });

    const res = await req("/api/search?q=Hello&table=notes");
    const body = await res.json();
    expect(body.every((r: { table: string }) => r.table === "notes")).toBe(true);
  });
});
