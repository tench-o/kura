import type Database from "better-sqlite3";
import type { ColumnDef, KuraRecord, RecordData } from "./types.js";
import { META_TABLE } from "./types.js";

/**
 * Get column definitions for a table from _kura_meta.
 */
function getColumnDefs(db: Database.Database, tableName: string): ColumnDef[] {
  const rows = db
    .prepare(
      `SELECT column_name, column_type, relation_target, relation_display, position
       FROM ${META_TABLE} WHERE table_name = ? ORDER BY position`,
    )
    .all(tableName) as Array<{
    column_name: string;
    column_type: string;
    relation_target: string | null;
    relation_display: string | null;
    position: number;
  }>;

  return rows.map((r) => ({
    name: r.column_name,
    type: r.column_type as ColumnDef["type"],
    relationTarget: r.relation_target ?? undefined,
    relationDisplay: r.relation_display ?? undefined,
    position: r.position,
  }));
}

/**
 * Determine the display column for a relation target table.
 *
 * Priority:
 * 1. Explicit relation_display from _kura_meta
 * 2. First text column of the target table
 * 3. Fallback to "id"
 */
export function getDisplayColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
): string {
  // Check explicit relation_display
  const meta = db
    .prepare(
      `SELECT relation_display, relation_target FROM ${META_TABLE}
       WHERE table_name = ? AND column_name = ?`,
    )
    .get(tableName, columnName) as
    | { relation_display: string | null; relation_target: string | null }
    | undefined;

  if (meta?.relation_display) {
    return meta.relation_display;
  }

  const targetTable = meta?.relation_target;
  if (!targetTable) {
    return "id";
  }

  // Find first text column of target table
  const textCol = db
    .prepare(
      `SELECT column_name FROM ${META_TABLE}
       WHERE table_name = ? AND column_type = 'text'
       ORDER BY position LIMIT 1`,
    )
    .get(targetTable) as { column_name: string } | undefined;

  return textCol?.column_name ?? "id";
}

/**
 * Resolve a single relation value by looking up the display column.
 */
export function resolveRelationValue(
  db: Database.Database,
  targetTable: string,
  displayColumn: string,
  id: number,
): string | null {
  const row = db
    .prepare(`SELECT "${displayColumn}" AS val FROM "${targetTable}" WHERE id = ?`)
    .get(id) as { val: string | number | null } | undefined;

  if (row === undefined || row.val === null) {
    return null;
  }
  return String(row.val);
}

/**
 * Resolve soft relations for an array of records.
 *
 * For relation columns: replaces the stored ID with the display value from the target table.
 * For relation[] columns: parses the JSON array of IDs and replaces with comma-separated display values.
 *
 * Returns a new array — originals are not mutated.
 */
export function resolveRelations(
  db: Database.Database,
  tableName: string,
  records: KuraRecord[],
): KuraRecord[] {
  if (records.length === 0) return [];

  const columns = getColumnDefs(db, tableName);
  const relationCols = columns.filter(
    (c) => c.type === "relation" || c.type === "relation[]",
  );

  if (relationCols.length === 0) {
    // No relations to resolve — return shallow copies
    return records.map((r) => ({ ...r, data: { ...r.data } }));
  }

  // Deep-copy records
  const resolved: KuraRecord[] = records.map((r) => ({
    ...r,
    data: { ...r.data },
  }));

  for (const col of relationCols) {
    const targetTable = col.relationTarget;
    if (!targetTable) continue;

    const displayCol = getDisplayColumn(db, tableName, col.name);

    // Collect all IDs across all records for batch query
    const allIds = new Set<number>();
    for (const rec of resolved) {
      const val = rec.data[col.name];
      if (col.type === "relation") {
        if (val !== null && val !== undefined) {
          allIds.add(Number(val));
        }
      } else {
        // relation[]
        if (val !== null && val !== undefined && typeof val === "string") {
          try {
            const ids = JSON.parse(val) as number[];
            for (const id of ids) {
              allIds.add(Number(id));
            }
          } catch {
            // Invalid JSON — skip
          }
        }
      }
    }

    if (allIds.size === 0) continue;

    // Batch-query target table
    const idArray = [...allIds];
    const placeholders = idArray.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, "${displayCol}" AS display_val FROM "${targetTable}" WHERE id IN (${placeholders})`,
      )
      .all(...idArray) as Array<{ id: number; display_val: string | number | null }>;

    const lookup = new Map<number, string>();
    for (const row of rows) {
      lookup.set(row.id, row.display_val !== null ? String(row.display_val) : "");
    }

    // Replace values in resolved records
    for (const rec of resolved) {
      const val = rec.data[col.name];
      if (col.type === "relation") {
        if (val !== null && val !== undefined) {
          const displayVal = lookup.get(Number(val));
          rec.data[col.name] = displayVal ?? null;
        }
      } else {
        // relation[]
        if (val !== null && val !== undefined && typeof val === "string") {
          try {
            const ids = JSON.parse(val) as number[];
            const displayValues = ids
              .map((id) => lookup.get(Number(id)))
              .filter((v): v is string => v !== undefined);
            rec.data[col.name] = displayValues.join(", ");
          } catch {
            rec.data[col.name] = null;
          }
        }
      }
    }
  }

  return resolved;
}
