# Tables API – PostgreSQL Backend

A flexible REST API for managing dynamic data tables with custom schemas. Rows are stored as JSONB in PostgreSQL, allowing schema changes without downtime or table locks.

**Stack:** Node.js + Express + PostgreSQL

---

## Features

- ✓ **Create tables** with typed columns (string, number, boolean)
- ✓ **Insert/Update/Delete rows** with type validation
- ✓ **Retrieve rows** with optional filtering
- ✓ **Modify schemas** (add/remove columns) without table locks
- ✓ **Filter by any column** with type-specific WHERE clauses
- ✓ **Enforce limits** (max 500 columns per table, max 1MB request body)
- ✓ **Cascade deletes** (delete table → deletes all rows and schema)

---

## Requirements

### Prerequisites
- **Node.js 18+** (for built-in test runner)
- **PostgreSQL 12+** (for JSONB support)
- **npm** (for dependency management)

### Optional
- **jq** — for pretty-printing JSON in manual tests (not required)

---

## Setup & Build

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Database
By default, the app connects to PostgreSQL on `localhost:5432` with:
- User: `postgres`
- Password: `postgres`
- Database: `helloworld`

To use different credentials, set environment variables:
```bash
export DB_USER=your_user
export DB_PASSWORD=your_password
export DB_HOST=your_host
export DB_PORT=5432
export DB_NAME=your_database
```

### 3. Verify PostgreSQL is Running
```bash
psql -U postgres -d postgres -c "SELECT version();"
```

---

## Running the Application

### Start the Server
```bash
node index.js
```

Server listens on `http://localhost:3000`

Output:
```
Server listening on port 3000
```

---

## Running Tests

### Automated Unit Tests (39 tests)
```bash
npm test
```

**What it tests:**
- GET /helloworld (2 tests)
- POST /tables (7 tests) — creation, validation, 500 column limit
- POST /tables/:id/rows (5 tests) — insert, type validation, required fields
- GET /tables/:id/rows (7 tests) — retrieval, filtering by string/number/boolean
- PATCH /tables/:id/schema (10 tests) — add/remove columns, validation, 500 limit
- PUT /tables/:id/rows/:id (4 tests) — update rows
- DELETE /tables/:id/rows/:id (2 tests) — delete rows
- DELETE /tables/:id (2 tests) — delete tables with cascade

**Expected output:**
```
# tests 39
# pass 39
# fail 0
```

### Manual Testing with curl

**Start server in one terminal:**
```bash
node index.js
```

**Run manual tests in another terminal:**
```bash
bash test-api.sh
```

Or manually test individual endpoints — see examples below.

---

## API Endpoints

### 1. Create Table
```bash
POST /tables
Content-Type: application/json

{
  "name": "customers",
  "columns": [
    { "name": "name", "type": "string" },
    { "name": "age", "type": "number" },
    { "name": "active", "type": "boolean" }
  ]
}
```

**Response (201):**
```json
{
  "id": "699b12be-fc9d-4fb3-9651-3328ce4e841f",
  "name": "customers",
  "columns": [
    { "id": "...", "name": "name", "type": "string", "position": 0 },
    { "id": "...", "name": "age", "type": "number", "position": 1 },
    { "id": "...", "name": "active", "type": "boolean", "position": 2 }
  ]
}
```

**Validation:**
- `name` must be non-empty string (max 255 chars)
- `columns` must be non-empty array (max 500 columns)
- Column names must be unique
- Column types must be one of: `string`, `number`, `boolean`

---

### 2. Insert Row
```bash
POST /tables/:table_id/rows
Content-Type: application/json

{
  "name": "Alice",
  "age": 30,
  "active": true
}
```

**Response (201):**
```json
{
  "id": "f02dccba-1d79-42d2-a4bc-c945a32c0ff1",
  "name": "Alice",
  "age": 30,
  "active": true,
  "created_at": "2026-04-16T12:34:56.789Z"
}
```

**Validation:**
- All columns must be present
- Values must match declared column types
- No extra fields allowed

---

### 3. Get All Rows
```bash
GET /tables/:table_id/rows
```

**Response (200):**
```json
[
  {
    "id": "f02dccba-1d79-42d2-a4bc-c945a32c0ff1",
    "name": "Alice",
    "age": 30,
    "active": true,
    "created_at": "2026-04-16T12:34:56.789Z"
  }
]
```

---

### 4. Filter Rows
```bash
GET /tables/:table_id/rows?filter[name]=Alice&filter[age]=30
```

**Supported filters:**
- String columns: exact match
- Number columns: numeric match
- Boolean columns: `true` or `false`

**Response (200):**
```json
[
  {
    "id": "f02dccba-1d79-42d2-a4bc-c945a32c0ff1",
    "name": "Alice",
    "age": 30,
    "active": true,
    "created_at": "2026-04-16T12:34:56.789Z"
  }
]
```

---

### 5. Update Row
```bash
PUT /tables/:table_id/rows/:row_id
Content-Type: application/json

{
  "name": "Alice Updated",
  "age": 31,
  "active": false
}
```

**Response (200):**
```json
{
  "id": "f02dccba-1d79-42d2-a4bc-c945a32c0ff1",
  "name": "Alice Updated",
  "age": 31,
  "active": false,
  "created_at": "2026-04-16T12:34:56.789Z"
}
```

---

### 6. Modify Schema (Add/Remove Columns)

#### Add Column
```bash
PATCH /tables/:table_id/schema
Content-Type: application/json

{
  "add": [
    { "name": "email", "type": "string" }
  ]
}
```

#### Remove Column
```bash
PATCH /tables/:table_id/schema
Content-Type: application/json

{
  "remove": ["email"]
}
```

**Response (200):**
```json
{
  "id": "699b12be-fc9d-4fb3-9651-3328ce4e841f",
  "columns": [
    { "id": "...", "name": "name", "type": "string", "position": 0 },
    { "id": "...", "name": "age", "type": "number", "position": 1 },
    { "id": "...", "name": "active", "type": "boolean", "position": 2 }
  ]
}
```

**Validation:**
- Cannot add columns beyond 500 total
- Cannot remove columns that don't exist
- Cannot add columns that already exist

---

### 7. Delete Row
```bash
DELETE /tables/:table_id/rows/:row_id
```

**Response (204 No Content)**

---

### 8. Delete Table
```bash
DELETE /tables/:table_id
```

**Response (204 No Content)**

Cascades: deletes all rows and schema columns automatically.

---

## Error Responses

All error responses have HTTP status code and JSON body:

```json
{
  "error": "Column does not exist: nonexistent"
}
```

**Common status codes:**
- **400 Bad Request** — validation failures (invalid type, missing fields, unknown column, 500+ columns)
- **404 Not Found** — table/row doesn't exist
- **409 Conflict** — column already exists
- **500 Internal Server Error** — unexpected server errors

---

## Architecture

### Storage: JSONB on PostgreSQL

Row data is stored as JSONB documents, allowing flexible schemas without DDL locks:

```sql
CREATE TABLE rows (
  id UUID PRIMARY KEY,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',  -- Stores {name: "Alice", age: 30, ...}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Benefits:**
- ✓ Schema changes don't lock the table (no `ALTER TABLE`)
- ✓ Queryable via `data->>'column_name'` operators
- ✓ Type casting: `(data->>'age')::numeric` for number columns
- ✓ Indexed with GIN for fast filtering

### Schema Validation

Type enforcement happens in JavaScript before inserting into JSONB:
1. Load schema from `columns` table
2. Validate all rows fields match declared types
3. Insert JSONB document (correct by construction)

### 500 Column Limit

Enforced at:
1. Table creation: `columns` array validation
2. Schema mutations: calculate final count before accepting PATCH

---

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | Express app, route handlers, request validation |
| `db.js` | PostgreSQL connection pool, schema DDL, query helpers |
| `index.test.js` | 39 comprehensive unit tests |
| `test-api.sh` | Manual end-to-end test script |
| `README_TESTING.md` | Detailed testing guide with curl examples |
| `README_DESIGN.md` | Schema design decisions and tradeoffs |

---

## Example Workflow

```bash
# 1. Create a table
TABLE_ID=$(curl -s -X POST http://localhost:3000/tables \
  -H "Content-Type: application/json" \
  -d '{"name":"products","columns":[{"name":"name","type":"string"},{"name":"price","type":"number"}]}' \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# 2. Insert rows
curl -X POST http://localhost:3000/tables/$TABLE_ID/rows \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":999.99}'

curl -X POST http://localhost:3000/tables/$TABLE_ID/rows \
  -H "Content-Type: application/json" \
  -d '{"name":"Mouse","price":29.99}'

# 3. Retrieve all rows
curl http://localhost:3000/tables/$TABLE_ID/rows

# 4. Filter rows
curl "http://localhost:3000/tables/$TABLE_ID/rows?filter[name]=Laptop"

# 5. Add a column
curl -X PATCH http://localhost:3000/tables/$TABLE_ID/schema \
  -H "Content-Type: application/json" \
  -d '{"add":[{"name":"in_stock","type":"boolean"}]}'

# 6. Update a row
ROW_ID=$(curl -s http://localhost:3000/tables/$TABLE_ID/rows | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -X PUT http://localhost:3000/tables/$TABLE_ID/rows/$ROW_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":899.99,"in_stock":true}'

# 7. Delete the table
curl -X DELETE http://localhost:3000/tables/$TABLE_ID
```

---

## Limitations & Future Work

**Current scope:**
- Single PostgreSQL instance (no replication or sharding)
- No authentication or authorization
- No pagination (all rows returned)
- No soft deletes (hard delete only)
- No audit trail

**Future improvements:**
- Pagination with LIMIT/OFFSET
- Per-column functional indexes for large filter operations
- Soft deletes with `deleted_at` timestamps
- Role-based access control
- Request rate limiting
- Structured logging and observability
