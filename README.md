# kura — Local Database

> 蔵（くら）— A storehouse for your data

SQLite-based general-purpose local database CLI & MCP Server.

Notion-like flexible table management from the command line, designed for AI agent integration.

## Features

- **Dynamic schema** — Create tables with arbitrary columns, evolve schema anytime
- **Soft relations** — Notion-style table linking without foreign key constraints
- **Full-text search** — FTS5-powered cross-table search (CJK supported)
- **MCP Server** — Works as a Model Context Protocol server for AI agent integration
- **Rich CLI output** — Beautiful table display in terminal
- **Multiple databases** — Switch between databases with `--db` flag
- **Auto timestamps** — `created_at` / `updated_at` on all records
- **Import/Export** — CSV and JSON support

## Installation

```bash
# Use directly with npx (no install needed)
npx kura-db

# Or install globally
npm install -g kura-db
```

## Quick Start

```bash
# Initialize a database
kura init

# Create tables
kura table create companies name:text industry:text url:text
kura table create tags name:text color:text
kura table create candidates \
  name:text \
  email:text \
  status:text \
  salary:int \
  "company:relation(companies)" \
  "tags:relation[](tags)" \
  notes:text

# Add records
kura add companies name="Acme Corp" industry=IT url=https://acme.example.com
kura add tags name=engineer color=blue
kura add tags name=senior color=green
kura add candidates name=田中太郎 email=tanaka@example.com status=面接中 company=1 tags=1,2

# Query
kura list candidates
kura list candidates --where "status=面接中" --sort "-created_at" --limit 10
kura get candidates 1
kura search "田中"

# Update & Delete
kura update candidates 1 status=内定 salary=6000000
kura delete candidates 3

# Schema evolution
kura table add-column candidates phone:text
kura table describe candidates

# Raw SQL
kura query "SELECT status, COUNT(*) as count FROM candidates GROUP BY status"

# Import / Export
kura import candidates ./data.csv
kura export candidates --format json > candidates.json

# MCP Server mode
kura serve
```

## Column Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | UTF-8 string | `name:text` |
| `int` | Integer | `salary:int` |
| `real` | Floating point | `score:real` |
| `bool` | Boolean (0/1) | `active:bool` |
| `relation(table)` | Soft reference to another table (single) | `company:relation(companies)` |
| `relation[](table)` | Soft reference to another table (multiple) | `tags:relation[](tags)` |

## Soft Relations

Relations are **soft references** — inspired by Notion's relation columns:

- No foreign key constraints enforced at the database level
- Referenced records can be deleted without error (orphan-tolerant)
- Display resolves referenced IDs to human-readable values automatically
- Many-to-many via `relation[]` type (stored as JSON array)

```bash
# When listing, relations are resolved automatically:
kura list candidates
# ┌────┬──────────┬────────────┬──────────────────┐
# │ id │ name     │ company    │ tags             │
# ├────┼──────────┼────────────┼──────────────────┤
# │  1 │ 田中太郎  │ Acme Corp  │ engineer, senior │
# └────┴──────────┴────────────┴──────────────────┘

# Use --raw to see raw IDs instead
kura list candidates --raw
```

## Multiple Databases

```bash
# Default database: ~/.kura/default.db
kura list candidates

# Use a specific database
kura --db=recruiting list candidates
# → ~/.kura/recruiting.db

# Use an absolute path
kura --db=/path/to/my.db list candidates
```

## MCP Server

Start as an MCP server for integration with Claude Code and other AI tools:

```bash
kura serve
```

### Claude Code configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "kura": {
      "command": "npx",
      "args": ["-y", "kura-db", "serve"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `list_tables` | List all tables and their schemas |
| `describe_table` | Get detailed table schema |
| `create_table` | Create a new table with columns |
| `add_record` | Add a record to a table |
| `list_records` | Query records with filters and sorting |
| `get_record` | Get a single record by ID |
| `update_record` | Update a record |
| `delete_record` | Delete a record |
| `search` | Full-text search across all tables |
| `run_query` | Execute raw SQL |

## Data Storage

```
~/.kura/
├── default.db        # Default database
├── recruiting.db     # Named database (--db=recruiting)
└── ...
```

Each database is a single SQLite file. Back up, copy, or version-control as you like.

## Requirements

- Node.js >= 18
- `better-sqlite3` requires a C++ compiler for native module compilation. On most systems this is already available. If you encounter issues:
  - **macOS**: `xcode-select --install`
  - **Ubuntu/Debian**: `sudo apt install build-essential python3`
  - **Windows**: Install Visual Studio Build Tools

## License

MIT
