# Manual Testing Guide

This guide covers manual end-to-end testing of the Tables API using curl commands.

## Prerequisites

- Node.js and npm installed
- PostgreSQL running on localhost:5432
- `jq` installed for JSON parsing (optional, for test-api.sh)
- curl installed

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   node index.js
   ```
   
   The server will listen on `http://localhost:3000`

3. **Verify database initialization:**
   The server will automatically initialize the Postgres database and create tables on startup.

## Running Tests

### Automated Manual Testing Script

Run the provided test script to exercise all endpoints:

```bash
./test-api.sh
```

This script will:
- Create a table with multiple column types
- Insert 3 sample rows
- Retrieve all rows
- Filter rows by string, number, and boolean columns
- Update a row
- Add and remove columns from schema
- Delete individual rows
- Delete the entire table
- Run validation tests for error cases

**Expected output:** All tests complete with HTTP 2xx status codes for successful operations, 4xx for validation errors, and 404 for not found cases.

### Manual curl Commands

#### 1. Create a Table

```bash
curl -X POST http://localhost:3000/tables \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products",
    "columns": [
      {"name": "title", "type": "string"},
      {"name": "price", "type": "number"},
      {"name": "in_stock", "type": "boolean"}
    ]
  }'
```

**Expected:** HTTP 201, returns table object with id, name, columns, and empty rows array.

---

#### 2. Insert Rows

```bash
curl -X POST http://localhost:3000/tables/{TABLE_ID}/rows \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Widget",
    "price": 19.99,
    "in_stock": true
  }'
```

**Expected:** HTTP 201, returns row object with id, title, price, in_stock, created_at.

---

#### 3. Get All Rows

```bash
curl -X GET http://localhost:3000/tables/{TABLE_ID}/rows
```

**Expected:** HTTP 200, returns array of row objects.

---

#### 4. Filter Rows

**By string:**
```bash
curl -X GET "http://localhost:3000/tables/{TABLE_ID}/rows?filter[title]=Widget"
```

**By number:**
```bash
curl -X GET "http://localhost:3000/tables/{TABLE_ID}/rows?filter[price]=19.99"
```

**By boolean:**
```bash
curl -X GET "http://localhost:3000/tables/{TABLE_ID}/rows?filter[in_stock]=true"
```

**Expected:** HTTP 200, returns filtered array of row objects (or empty array if no matches).

---

#### 5. Update a Row

```bash
curl -X PUT http://localhost:3000/tables/{TABLE_ID}/rows/{ROW_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Widget",
    "price": 24.99,
    "in_stock": false
  }'
```

**Expected:** HTTP 200, returns updated row object.

---

#### 6. Add Column to Schema

```bash
curl -X PATCH http://localhost:3000/tables/{TABLE_ID}/schema \
  -H "Content-Type: application/json" \
  -d '{
    "add": [
      {"name": "category", "type": "string"}
    ]
  }'
```

**Expected:** HTTP 200, returns table object with updated columns array.

---

#### 7. Remove Column from Schema

```bash
curl -X PATCH http://localhost:3000/tables/{TABLE_ID}/schema \
  -H "Content-Type: application/json" \
  -d '{
    "remove": ["category"]
  }'
```

**Expected:** HTTP 200, returns table object with updated columns array (column removed from JSONB in all rows).

---

#### 8. Delete a Row

```bash
curl -X DELETE http://localhost:3000/tables/{TABLE_ID}/rows/{ROW_ID}
```

**Expected:** HTTP 204 No Content.

---

#### 9. Delete a Table

```bash
curl -X DELETE http://localhost:3000/tables/{TABLE_ID}
```

**Expected:** HTTP 204 No Content. All columns and rows are cascaded-deleted.

---

## Validation Tests

### Test Missing Required Field

```bash
curl -X POST http://localhost:3000/tables/{TABLE_ID}/rows \
  -H "Content-Type: application/json" \
  -d '{"title": "Incomplete"}'
```

**Expected:** HTTP 400, error message includes "Missing field: price".

### Test Wrong Type

```bash
curl -X POST http://localhost:3000/tables/{TABLE_ID}/rows \
  -H "Content-Type: application/json" \
  -d '{"title": "Widget", "price": "not a number", "in_stock": true}'
```

**Expected:** HTTP 400, error message includes "Field \"price\" must be number".

### Test Unknown Filter Column

```bash
curl -X GET "http://localhost:3000/tables/{TABLE_ID}/rows?filter[unknown_column]=value"
```

**Expected:** HTTP 400, error message includes "Unknown column: unknown_column".

### Test Non-Existent Table

```bash
curl -X GET http://localhost:3000/tables/00000000-0000-0000-0000-000000000000/rows
```

**Expected:** HTTP 404, error message includes "Table not found".

### Test Non-Existent Row

```bash
curl -X PUT http://localhost:3000/tables/{TABLE_ID}/rows/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "price": 10, "in_stock": true}'
```

**Expected:** HTTP 404, error message includes "Row not found".

---

## Running Unit Tests

```bash
npm test
```

All 33 tests should pass:
- 2 tests for GET /helloworld
- 7 tests for POST /tables
- 5 tests for POST /tables/:id/rows
- 6 tests for GET /tables/:id/rows (including filtering)
- 5 tests for PATCH /tables/:id/schema
- 4 tests for PUT /tables/:id/rows/:id
- 2 tests for DELETE /tables/:id/rows/:id
- 2 tests for DELETE /tables/:id

---

## Debugging

### View Server Logs

The server prints each request to stdout:
```
POST /tables
POST /tables/xxxxx/rows
GET /tables/xxxxx/rows
```

### Check Database State

Connect to PostgreSQL directly:
```bash
psql -U postgres -d helloworld
```

Query the tables:
```sql
SELECT * FROM tables;
SELECT * FROM columns WHERE table_id = 'xxxxx';
SELECT * FROM rows WHERE table_id = 'xxxxx';
```

---

## Common Issues

**Port 3000 already in use:**
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill process
```

**Database connection error:**
- Verify PostgreSQL is running: `psql -U postgres -d postgres`
- Check connection string in db.js (default: localhost:5432, user: postgres, password: postgres)

**jq not found (for test-api.sh):**
- Install jq: `apt-get install jq` (Linux) or `brew install jq` (macOS)
- Or parse JSON manually with grep/sed
