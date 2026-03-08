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
# Install from GitHub
npm install -g tench-o/kura

# Or run directly from GitHub (no install needed)
npx github:tench-o/kura
```

<!-- Coming soon: npm install -g kura-db -->

## Quick Start

```bash
# Initialize a database
kura init

# Create tables
kura table create authors name:text country:text
kura table create genres name:text color:text
kura table create books \
  title:text \
  pages:int \
  rating:real \
  read:bool \
  "author:relation(authors)" \
  "genres:relation[](genres)" \
  notes:text

# Add records
kura add authors name="Haruki Murakami" country=Japan
kura add authors name="Ursula K. Le Guin" country=USA
kura add genres name=fiction color=blue
kura add genres name=sci-fi color=purple
kura add books title="Kafka on the Shore" pages=480 rating=4.5 read=true author=1 genres=1 notes="Mind-bending"
kura add books title="The Left Hand of Darkness" pages=304 rating=4.8 read=false author=2 genres=1,2

# Query
kura list books
kura list books --where "read=1" --sort "-rating" --limit 10
kura get books 1
kura search "Kafka"

# Update & Delete
kura update books 2 read=true rating=4.9
kura delete books 1

# Schema evolution
kura table add-column books isbn:text
kura table describe books

# Raw SQL
kura query "SELECT rating, COUNT(*) as count FROM books GROUP BY rating"

# Import / Export
kura import books ./data.csv
kura export books --format json > books.json

# MCP Server mode
kura serve
```

## Column Types

| Type | Description | Example |
|------|-------------|---------|
| `text` | UTF-8 string | `title:text` |
| `int` | Integer | `pages:int` |
| `real` | Floating point | `rating:real` |
| `bool` | Boolean (0/1) | `read:bool` |
| `relation(table)` | Soft reference to another table (single) | `author:relation(authors)` |
| `relation[](table)` | Soft reference to another table (multiple) | `genres:relation[](genres)` |

## Soft Relations

Relations are **soft references** — inspired by Notion's relation columns:

- No foreign key constraints enforced at the database level
- Referenced records can be deleted without error (orphan-tolerant)
- Display resolves referenced IDs to human-readable values automatically
- Many-to-many via `relation[]` type (stored as JSON array)

```bash
# When listing, relations are resolved automatically:
kura list books
# ┌────┬──────────────────────────┬───────────────────┬────────────────┐
# │ id │ title                    │ author            │ genres         │
# ├────┼──────────────────────────┼───────────────────┼────────────────┤
# │  1 │ Kafka on the Shore       │ Haruki Murakami   │ fiction        │
# │  2 │ The Left Hand of Darkness│ Ursula K. Le Guin │ fiction, sci-fi│
# └────┴──────────────────────────┴───────────────────┴────────────────┘

# Use --raw to see raw IDs instead
kura list books --raw
```

## Multiple Databases

```bash
# Default database: ~/.kura/default.db
kura list books

# Use a specific database
kura --db=library list books
# → ~/.kura/library.db

# Use an absolute path
kura --db=/path/to/my.db list books
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
      "args": ["-y", "github:tench-o/kura", "serve"]
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
├── library.db        # Named database (--db=library)
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
