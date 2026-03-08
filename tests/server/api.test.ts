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
