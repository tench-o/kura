# kura — Development Guide

## Overview

kura is a SQLite-based general-purpose local database CLI & MCP Server.
TypeScript project using Node.js. Package name: `kura-db`, CLI command: `kura`.

## Tech Stack

- **Runtime**: Node.js (>=18)
- **Language**: TypeScript (strict mode)
- **CLI framework**: Commander.js
- **MCP**: @modelcontextprotocol/sdk
- **SQLite**: better-sqlite3
- **Display**: cli-table3 + chalk
- **Build**: tsup (ESM bundle)
- **Test**: vitest

## Project Structure

```
kura-db/
├── src/
│   ├── index.ts          # CLI entry point (Commander setup)
│   ├── core/
│   │   ├── database.ts   # SQLite connection & initialization
│   │   ├── schema.ts     # Table creation, schema evolution, metadata management
│   │   ├── records.ts    # CRUD operations (add, list, get, update, delete)
│   │   ├── relations.ts  # Soft relation resolution & storage
│   │   ├── search.ts     # FTS5 full-text search (trigram tokenizer for CJK)
│   │   └── types.ts      # Shared type definitions
│   ├── cli/
│   │   ├── table.ts      # `kura table` subcommands
│   │   ├── records.ts    # `kura add/list/get/update/delete` commands
│   │   ├── search.ts     # `kura search` command
│   │   ├── query.ts      # `kura query` command
│   │   ├── io.ts         # `kura import/export` commands
│   │   └── display.ts    # Rich table formatting & output
│   └── mcp/
│       └── server.ts     # MCP server (tools map to core functions)
├── tests/
│   ├── core/             # Unit tests for core logic
│   └── mcp/              # MCP server tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── LICENSE
├── README.md
└── CLAUDE.md
```

## Architecture Principles

### Core is the single source of truth

Both CLI and MCP Server call into `src/core/`. Never put business logic in CLI or MCP layers.

```
CLI (Commander) ──→ Core ←── MCP Server
                     ↓
                   SQLite
```

### Internal tables

kura uses a metadata table `_kura_meta` to track schema information:

```sql
CREATE TABLE _kura_meta (
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  column_type TEXT NOT NULL,       -- text, int, real, bool, relation, relation[]
  relation_target TEXT,            -- Target table name (relation types only)
  relation_display TEXT,           -- Column to display from target (default: first text column)
  position INTEGER NOT NULL,       -- Column order
  PRIMARY KEY (table_name, column_name)
);
```

All user tables automatically include:
- `id` — INTEGER PRIMARY KEY AUTOINCREMENT
- `created_at` — TEXT (ISO 8601), DEFAULT CURRENT_TIMESTAMP
- `updated_at` — TEXT (ISO 8601), trigger-updated

### Soft relations

Relations are stored as:
- `relation(target)` → INTEGER column (single ID)
- `relation[](target)` → TEXT column (JSON array of IDs, e.g., `[1,3,5]`)

No foreign key constraints. Resolution is done at display/read time by joining against the target table.

### Column type mapping

| kura type | SQLite type | Notes |
|-----------|-------------|-------|
| text | TEXT | |
| int | INTEGER | |
| real | REAL | |
| bool | INTEGER | 0 or 1 |
| relation | INTEGER | Stores target record ID |
| relation[] | TEXT | JSON array of IDs |

## Commands

```bash
# Development
npm install               # Install dependencies
npm run dev               # Run in development mode (tsx)
npm run build             # Build with tsup
npm test                  # Run tests with vitest
npm run lint              # ESLint

# Manual testing
npx tsx src/index.ts <command>   # Run CLI during development
```

## Code Conventions

- Use **ESM** (`import`/`export`), not CommonJS
- Prefer **named exports** over default exports
- Error messages should be user-friendly, no stack traces in normal operation
- All core functions are **synchronous** (better-sqlite3 is sync)
- Use `Database` class in `core/database.ts` as the single connection manager
- CLI display logic stays in `cli/display.ts` — core returns plain objects
- MCP tools map 1:1 to core functions — keep the MCP layer thin

## Testing

- Test against in-memory SQLite (`:memory:`) for speed
- Each test gets a fresh database instance
- Test core logic directly, not through CLI parsing

## Error Handling

- Core functions throw typed errors (`KuraError` with code)
- CLI catches errors and displays user-friendly messages with `chalk.red`
- MCP server returns errors in MCP error format
- Never expose raw SQL errors to users — wrap them

## Key Design Decisions

1. **No foreign keys** — Relations are soft references for Notion-like flexibility
2. **Metadata in `_kura_meta`** — Schema info lives in the DB alongside data, making each .db file self-contained
3. **Sync API** — better-sqlite3 is synchronous, simpler mental model, no async overhead
4. **Single file per database** — Each .db file is portable and self-documenting
5. **FTS5 with trigram** — Trigram tokenizer for CJK support, LIKE fallback for queries < 3 chars
6. **CLI-first** — MCP is an interface layer, not the core; kura must be fully usable without MCP
