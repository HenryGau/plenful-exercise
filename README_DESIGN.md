# Design: Tables API with Postgres Backend

## Overview

This document describes the schema design and architectural decisions for the flexible data tables REST API.

---

## Storage Architecture: JSONB on Postgres

### Why JSONB Over 9 Alternatives

Nine approaches were evaluated. Only JSONB balances queryability, schema flexibility, performance, and simplicity.

#### The 3 Primary Contenders

| Approach | Queryable | DDL Locks | Type-Safe | Complexity | Verdict |
|---|---|---|---|---|---|
| **EAV** (cells table) | ✅ | ✅ | ✅ | Medium | ❌ Pivot queries painful; filter is multi-join; millions of rows for 500 cols × 10k rows |
| **Dynamic DDL** (real ALTER TABLE) | ✅ | ❌ | ✅ | High | ❌ AccessExclusiveLock blocks reads/writes; catalog pollution; SQL injection on identifiers |
| **JSONB for row data** | ✅ | ✅ | ❌* | Low | ✅ Schema changes are plain DML (zero locks); clean filter via `data->>'col'`; parameterized queries |

*Type-safety via application validation (same as current in-memory code).

#### 6 Other Alternatives Considered & Rejected

**1. Unstructured BLOB (JSON as TEXT)**
- Pros: Simplest schema, supports any type
- Cons: ❌ No queryability (full table scan for every filter), no indexing, fails REQUIREMENTS.md filter feature

**2. Sparse Columns (500 nullable columns per table)**
- Pros: Native types, queryable
- Cons: ❌ Catalog bloat (500 cols × 1000 tables = catalog pollution), row overhead increases, DDL is still required, inefficient for sparse data

**3. Hstore (Postgres's legacy KV store)**
- Pros: Lightweight, indexable
- Cons: ❌ All values are text (same casts as JSONB, but less optimized), no nested structures, outdated (JSONB is strictly better)

**4. NoSQL (MongoDB / DynamoDB)**
- Pros: Native flexible schema, queryable, scalable
- Cons: ❌ Requires external infrastructure (Postgres already wired), eventual consistency complicates validation, REQUIREMENTS.md specifies SQL database, overkill for interview scope

**5. Postgres Composite Types (CREATE TYPE for each user table)**
- Pros: Native types, type-safe, queryable
- Cons: ❌ Requires dynamic DDL (same problems as Dynamic DDL), type proliferation in catalog, destructive type drops, same complexity, no benefit

**6. Columnar Storage (DuckDB / Parquet / Timescale)**
- Pros: Excellent for filtering and analytics, compression
- Cons: ❌ Overkill for OLTP (mixed read/write), writes expensive (row-at-a-time inserts), added complexity

---

### JSONB Wins Because

1. **Queryable** — `data->>'name' = 'Alice'` works; GIN indexes handle containment queries efficiently.
2. **Zero DDL on schema changes** — `INSERT`/`DELETE` from `columns` table only. Never touches `rows` table. No `AccessExclusiveLock`.
3. **Simple implementation** — 3 tables, standard SQL, no dynamic identifiers, no catalog management.
4. **Scales to the constraint** — 500 columns × 100k rows = one `rows` table with 100k JSONB documents. No sparse column waste, no type proliferation.
5. **Validation in code** — Type enforcement happens at the API boundary (matches current in-memory `store.js` pattern). JSONB data is "correct by construction" — same safety as EAV or Composite Types, simpler.
6. **Postgres native** — No external dependencies; pg pool already wired in `db.js`.

**Key insight:** With JSONB, adding/removing columns never touches the `rows` table — only metadata in the `columns` table changes. Schema operations are fast and non-blocking.

---

## Schema

### Three Tables

```sql
CREATE TABLE IF NOT EXISTS tables (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS columns (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('string', 'number', 'boolean')),
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT columns_table_id_name_key UNIQUE (table_id, name)
);

CREATE TABLE IF NOT EXISTS rows (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);
CREATE INDEX IF NOT EXISTS idx_rows_table_id    ON rows(table_id);
CREATE INDEX IF NOT EXISTS idx_rows_data_gin    ON rows USING GIN (data);
```

### Design Choices

**Database Schema:**
- **`columns(table_id, name)` UNIQUE constraint**: Enforces unique column names per table at the DB level (replaces the `Set` dedup check in in-memory code).
- **`rows.data JSONB`**: One row per user row, regardless of column count. Example: `{"name":"Alice","age":30,"active":true}`. No DDL overhead for schema changes.
- **GIN index on `data`**: Enables fast JSONB containment queries (`data @> '{"name":"Alice"}'`) and key existence checks (`data ? 'colname'`).
- **FK `ON DELETE CASCADE`**: Delete a table → cascade deletes its columns and rows automatically.

**Data & API Semantics:**
- **NULL vs. Missing JSONB Keys**: When a field hasn't been set (e.g., newly added column), the key is omitted from the JSONB object, not stored as `null`. On GET, the API returns only the keys present in `data`. On INSERT/PUT, missing fields are treated as validation errors (all fields required).
  - Example: `{"name":"Alice","age":30}` — no `active` key. If `active` column was just added, existing rows don't have it; new rows must include it.
- **IDs**: UUIDs for all primary keys (`tables.id`, `columns.id`, `rows.id`). Matches current in-memory code pattern (`randomUUID()`). No centralized ID generation needed; distributed ID generation.
- **Deletes**: Hard deletes only. `DELETE FROM rows` is permanent; no soft deletes (`deleted_at` flag). Soft deletes complicate every query (requires `WHERE deleted_at IS NULL` on reads). Add only if audit trails become a requirement.

---

## API Operations → SQL Mapping

### POST /tables — Create Table

```sql
INSERT INTO tables (name) VALUES ($1) RETURNING id, name, created_at;

INSERT INTO columns (table_id, name, type, position)
VALUES ($1, $2, $3, $4), ($1, $5, $6, $7), ...
RETURNING id, name, type, position;
```

The UNIQUE constraint `(table_id, name)` catches duplicates at the DB level.

### PATCH /tables/{table_id}/schema — Add / Remove / Rename Columns

**Add column:**
```sql
INSERT INTO columns (table_id, name, type, position)
VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), 0)+1 FROM columns WHERE table_id=$1))
ON CONFLICT (table_id, name) DO NOTHING;
```
Existing rows in the `rows` table are unchanged — they simply lack the new key in their `data` JSONB until updated.

**Remove column (eager cleanup):**
```sql
BEGIN;
DELETE FROM columns WHERE table_id = $1 AND name = $2;
UPDATE rows SET data = data - $2 WHERE table_id = $1;
COMMIT;
```
Both operations in a single transaction. The `-` operator removes the key from JSONB: `'{"a":1,"b":2}'::jsonb - 'b'` → `'{"a":1}'`. No orphaned keys left behind.

**Rename column:**
```sql
UPDATE columns SET name = $3 WHERE table_id = $1 AND name = $2;
UPDATE rows
SET data = (data - $2) || jsonb_build_object($3, data->$2)
WHERE table_id = $1 AND data ? $2;
```

### GET /tables/{table_id}/rows — Retrieve Rows with Optional Filtering

**No filter:**
```sql
SELECT id, data, created_at
FROM rows
WHERE table_id = $1
ORDER BY created_at ASC;
```

**With filter (e.g., `?filter[name]=Alice&filter[age]=30`):**

Validate filter keys against `columns` table first (whitelist), then build:
```sql
SELECT id, data, created_at
FROM rows
WHERE table_id = $1
  AND data->>'name' = $2                    -- string column
  AND (data->>'age')::numeric = $3;         -- number column (cast)
```

The filter column name is NOT parameterizable (JSONB operators require literal keys), but since it's whitelisted against the `columns` table before insertion into the query, there is no injection risk.

### POST /tables/{table_id}/rows — Insert Row

```sql
-- 1. Load schema
SELECT name, type FROM columns WHERE table_id = $1 ORDER BY position;

-- 2. Validate body keys/types in application (same logic as current store.js)

-- 3. Insert
INSERT INTO rows (table_id, data)
VALUES ($1, $2::jsonb)
RETURNING id, data, created_at;
```

Response shape: `{ id, ...data }` — spread the JSONB fields into the response.

### PUT /tables/{table_id}/rows/{row_id} — Update Row

```sql
UPDATE rows
SET data = $3::jsonb
WHERE id = $2 AND table_id = $1
RETURNING id, data, created_at;
```

Full replace (PUT semantics). For partial updates (PATCH), use `data = data || $3::jsonb` to merge.

### DELETE /tables/{table_id}/rows/{row_id} — Delete Row

```sql
DELETE FROM rows
WHERE id = $1 AND table_id = $2;
```

Return 404 if no rows affected (`DELETE ... RETURNING` or check `rowCount === 0`).

---

## Implementation Details

### Transaction Safety for Column Removal

When removing a column, both the `DELETE FROM columns` and `UPDATE rows SET data = data - col` must run atomically. Use Postgres transactions:

```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('DELETE FROM columns WHERE table_id = $1 AND name = $2', [tableId, colName]);
  await client.query('UPDATE rows SET data = data - $1 WHERE table_id = $2', [colName, tableId]);
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

Without this, a process crash between DELETE and UPDATE leaves stale keys in row data.

### Schema Caching & Filter Validation

**The Problem:** JSONB operators like `data->>'colname'` require literal column names—they **cannot be parameterized**. This creates a potential SQL injection surface if you're not careful.

Example of **unsafe** code (don't do this):
```javascript
// DANGEROUS: colName comes directly from user input
const result = await pool.query(
  `SELECT * FROM rows WHERE table_id = $1 AND data->>'${colName}' = $2`,
  [tableId, filterValue]
);
// User could send colName = "active' OR 'x'='x" and break the query
```

**The Solution:** Whitelist approach—load the table's schema once per request, validate that filter keys exist in the schema, then use only the validated (safe) keys in the query.

**Implementation Pattern:**

```javascript
// Step 1: Load the schema (one query per request, not cached globally)
const schema = await getTableSchema(tableId);
// Returns: [{ name: 'name', type: 'string' }, { name: 'age', type: 'number' }, ...]

// Step 2: Validate filter keys against the schema
const filterKeys = Object.keys(req.query.filter || {});
const schemaKeys = schema.map(col => col.name);

for (const key of filterKeys) {
  if (!schemaKeys.includes(key)) {
    return res.status(400).json({ error: `Unknown column: ${key}` });
  }
}

// Step 3: Build the WHERE clause with validated keys
// Now safe to use key directly (it's guaranteed to be a real column name)
let whereClause = 'WHERE table_id = $1';
const params = [tableId];
let paramIdx = 2;

for (const key of filterKeys) {
  const col = schema.find(c => c.name === key);
  const value = req.query.filter[key];
  
  // Type-specific WHERE clauses
  if (col.type === 'string') {
    whereClause += ` AND data->>'${key}' = $${paramIdx}`;
  } else if (col.type === 'number') {
    whereClause += ` AND (data->>'${key}')::numeric = $${paramIdx}`;
  } else if (col.type === 'boolean') {
    whereClause += ` AND (data->>'${key}')::boolean = $${paramIdx}`;
  }
  
  params.push(value);
  paramIdx++;
}

const result = await pool.query(
  `SELECT id, data, created_at FROM rows ${whereClause} ORDER BY created_at ASC`,
  params
);
```

**Why Load Schema Per Request (Not Globally)?**
- Captures the *current* schema state. If a column is removed mid-request, the old code doesn't use it.
- Prevents cache invalidation complexity. Don't need to bust a global cache when schema changes.
- Safe for concurrent requests to different tables with different schemas.
- Performance is fine: schema query hits index on `table_id` and returns ≤500 rows.

**Security Guarantee:**
- User input (filter keys) is validated against a whitelisted set (the real columns).
- Only validated, safe keys are interpolated into the query string.
- Values are still parameterized (`$1`, `$2`, ...), so they're SQL-injection proof.
- Combines the safety of parameterized queries (for values) + whitelisting (for column names).

### Validation Stays in Application

The `columns` table defines the schema, but row data validation happens in JavaScript (same as the current in-memory code). This allows:
- Type coercion decisions (e.g., reject vs. safely coerce `"30"` to `30` for a number column)
- Clear error messages before hitting the DB
- One source of truth for validation logic

---

## Tradeoffs

**Pros:**
- Schema changes are fast (plain DML, no DDL locks).
- No dynamic table creation complexity.
- Parameterized queries throughout (no SQL injection surface).
- Filtering works with standard Postgres JSONB operators.
- Scales well: one row per user row, regardless of column count.

**Cons:**
- No DB-level type enforcement on `data` JSONB — relies on application validation (same as current in-memory code).
- JSONB comparisons require casts for numbers/booleans (`(data->>'age')::numeric`).
- Coarse GIN index on all keys — very selective filters might benefit from per-column functional indexes (future optimization, not DDL-based).

---

## Migration Path

The current in-memory `store.js` is a direct translation target:

| store.js (in-memory) | Postgres equivalent |
|---|---|
| `Map<UUID, Table>` | `tables` table |
| `Table.columns: Column[]` | `columns` table WHERE `table_id = id` |
| `Table.rows: Row[]` | `rows` table WHERE `table_id = id` |
| `new Row(randomUUID(), values)` | `INSERT INTO rows ... RETURNING id` |
| `typeof val !== col.type` check | Same validation in app, then `INSERT` |
| `table not found → 404` | `SELECT FROM tables WHERE id = $1` → 0 rows → 404 |

Replace Map operations with parameterized `pool.query()` calls. All validation logic remains in JavaScript.

---

## Future Optimizations

1. **Functional indexes** on high-cardinality filter columns:
   ```sql
   CREATE INDEX idx_rows_email ON rows ((data->>'email'))
   WHERE table_id = $1;
   ```
   Not implemented initially; add if filtering becomes a bottleneck.

2. **Connection pooling tuning**: The `pg` Pool is already configured in `db.js`. Monitor and adjust `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` based on load.

3. **Pagination**: Add `LIMIT` and `OFFSET` to the GET rows endpoint once testing shows scale needs it.

4. **Soft deletes**: Change DELETE to an `is_deleted` flag if audit trails are needed.
