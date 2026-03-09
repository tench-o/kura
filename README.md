# kura — AI-native Local Database

> 蔵（くら）— A storehouse for your data

The local database built for AI agents.
Create tables, manage records, and query data — from CLI, MCP, or Web UI.
One SQLite file. Zero config. Full AI integration.

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
kura list books --filter "pages:gt:300" --filter "rating:gte:4"
kura list books --columns title,rating
kura get books 1
kura search "Kafka"
kura count books --where "read=1"

# Update & Delete
kura update books 2 read=true rating=4.9
kura delete books 1

# Schema evolution
kura table add-column books isbn:text
kura table describe books

# Raw SQL (relation columns store IDs without '_id' suffix, e.g., c.author not c.author_id)
kura query "SELECT b.title, a.name as author FROM books b JOIN authors a ON b.author = a.id"

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

## Filtering

Use `--filter` for advanced filtering with operators. Format: `column:operator:value`. Multiple filters are combined with AND.

```bash
kura list books --filter "pages:gt:300"
kura list books --filter "title:contains:Kafka" --filter "rating:gte:4"
kura list people --filter "email:is_not_empty"

# Combine with --where (exact match) and --sort
kura list books --where "read=1" --filter "rating:gt:3" --sort "-rating"
```

### Filter Operators

| Operator | Aliases | Description |
|----------|---------|-------------|
| `eq` | `=`, `is` | Equal |
| `neq` | `!=`, `is_not` | Not equal |
| `gt` | `>` | Greater than |
| `gte` | `>=` | Greater than or equal |
| `lt` | `<` | Less than |
| `lte` | `<=` | Less than or equal |
| `contains` | `like` | Contains substring (LIKE %value%) |
| `not_contains` | `not_like` | Does not contain substring |
| `is_empty` | `empty` | Is null or empty string |
| `is_not_empty` | `not_empty` | Is not null and not empty |

Filters are also available via the MCP `list_records` tool and the Web UI filter panel.

## Column Selection

Use `-c`/`--columns` to display only specific columns. Useful for wide tables.

```bash
kura list books --columns title,rating
kura list books -c title,author --sort "-rating" --limit 5

# Combine with filters
kura list candidates -c name,status --where "status=書類選考"
```

Only the specified columns are displayed. `id`, `created_at`, `updated_at` can be included by naming them explicitly. Column selection is also available via the MCP `list_records` tool (`columns` parameter) and the Web API (`?columns=title,rating`).

## Record Count

Count records in a table, optionally with filters. Faster than `list` when you only need the count.

```bash
kura count books
kura count candidates --where "status=書類選考"
kura count books --filter "pages:gt:300"
```

Also available via the MCP `count_records` tool.

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

## Web UI

Start a local web server to browse and edit your database in the browser:

```bash
kura ui --db library
# → http://localhost:51730

# Custom port
kura ui --db library -p 4000
```

Features: table sidebar, record list with sorting/pagination/filtering, record detail modal with inline editing, record create/delete, table create/delete, column add, full-text search, relation navigation.

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
| `list_records` | Query records with filters, column selection, and sorting |
| `get_record` | Get a single record by ID |
| `update_record` | Update a record |
| `delete_record` | Delete a record |
| `count_records` | Count records with optional filters |
| `search` | Full-text search across all tables |
| `run_query` | Execute raw SQL |
| `set_ai_context` | Set AI context metadata (database/table/column level) |
| `get_ai_context` | Get AI context metadata |
| `clear_ai_context` | Clear AI context metadata |

## AI Context

Embed semantic metadata into the database so any AI agent can understand the intent, rules, and conventions of your data — without external documentation.

```bash
# Database-level context
kura context set "Recruitment DB. Used by HR team and interview bot."

# Table-level context
kura context set candidates "One row per candidate. When status is 'offer', auto-add to notifications."

# Column-level context
kura context set candidates status "Selection status. Flow: applied → interview → offer/rejected. Reason required on rejection."

# View context
kura context show              # DB + all tables
kura context show candidates   # Table + columns

# Clear context
kura context clear                        # DB level
kura context clear candidates             # Table level
kura context clear candidates status      # Column level
```

AI context is stored inside the `.db` file itself, so it travels with the database. The `list_tables`, `describe_table`, `set_ai_context`, and `get_ai_context` MCP tools all expose this metadata to AI agents.

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
