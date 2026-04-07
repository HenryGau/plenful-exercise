# Table API – Coding Interview

A minimal REST API for managing data tables with custom schemas. Stack: Node.js + Express.

## What it does

- **Create tables** with typed columns (string, number, boolean)
- **Insert rows** with automatic type validation
- **Retrieve rows** from a table

Data is stored in memory. UUIDs are generated on the app side for both table and row IDs.

## How to run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   node index.js
   ```

   Server listens on port 3000.

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
    { "name": "name", "type": "string" },
    { "name": "age", "type": "number" },
    { "name": "active", "type": "boolean" }
  ],
  "rows": []
}
```

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
  "active": true
}
```

### 3. Get Rows
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
    "active": true
  }
]
```

## Error Handling

- **400 Bad Request** — validation failures (invalid type, missing fields, duplicate column names)
- **404 Not Found** — table ID doesn't exist
- **500 Internal Server Error** — unexpected server errors

Error responses:
```json
{
  "error": "Field \"age\" must be number, got string"
}
```

## Test Commands

```bash
# Create table
TABLE_ID=$(curl -s -X POST http://localhost:3000/tables \
  -H "Content-Type: application/json" \
  -d '{"name":"customers","columns":[{"name":"name","type":"string"},{"name":"age","type":"number"}]}' \
  | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

# Insert row (valid)
curl -s -X POST "http://localhost:3000/tables/$TABLE_ID/rows" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","age":30}'

# Insert row (invalid type — should return 400)
curl -s -X POST "http://localhost:3000/tables/$TABLE_ID/rows" \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","age":"thirty"}'

# Get all rows
curl -s "http://localhost:3000/tables/$TABLE_ID/rows"

# Get rows from non-existent table (should return 404)
curl -s "http://localhost:3000/tables/invalid-id/rows"
```

## Design Notes

**In-memory storage:** Data is stored in a `Map<UUID, TableRecord>` for O(1) lookups by table ID. No persistence — data is lost on restart.

**Type validation:** Happens at insert time. Values are checked against the declared column type using JavaScript's `typeof` operator.

**Column & Row classes:** `Column` encapsulates name and type. `Row` wraps the UUID and user-supplied fields via `Object.assign()`.

**Tradeoffs:**
- **No persistence:** For a real system, store in PostgreSQL or another database. Would need migrations for schema versioning.
- **No pagination:** For large tables, implement limit/offset or cursor pagination.
- **Synchronous everything:** All operations are in-memory and instant. A real API would handle async boundaries (DB I/O, external calls).
- **Minimal error context:** Error messages are basic. Production would include request IDs, stack traces in logs, structured logging.
