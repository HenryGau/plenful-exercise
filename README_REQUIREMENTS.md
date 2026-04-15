# Data Tables API

## Overview

Build a simple REST API for a flexible "data table" system that allows users to create "tables" with custom schemas and store/retrieve data. Think of it as a lightweight Airtable or database-as-a-service. 

**Technology:** Any stack you prefer; should be backend/API/database, no frontend needed.

---

## Core Concept

Users should be able to:
1. Create tables with custom column definitions
2. Modify table schemas (add/remove/edit columns)
3. Insert and query data from their tables
4. Delete tables

Example flow:
```
1. Create table "customers" with columns: name (string), age (number), active (boolean)
2. Insert row: {"name": "Alice", "age": 30, "active": true}
3. Query all rows
4. Add new column "email" (string)
5. Update existing row with email value
```

---

## Requirements

### APIs to Implement (4 endpoints)

**1. Create Table**
- `POST /tables`
- Body: `{"name": "customers", "columns": [{"name": "email", "type": "string"}, ...]}`
- Creates table with specified schema
- Returns table ID

**2. Update Schema**
- `PATCH /tables/{table_id}/schema`
- Body: `{"add_columns": [...], "remove_columns": ["column_name"]}`
- Adds or removes columns from existing table
- Handles data migration for removed columns

**3. Get Table Data**
- `GET /tables/{table_id}/rows`
- Query params: optional filtering/pagination
- Returns all rows with data

**4. Insert/Update/Delete Rows**
- `POST /tables/{table_id}/rows` - Insert new row
- `PUT /tables/{table_id}/rows/{row_id}` - Update row
- `DELETE /tables/{table_id}/rows/{row_id}` - Delete row

### Column Types (Support 3 types)
- `string` - text values
- `number` - numeric values (int or float)
- `boolean` - true/false

### Constraints
- Maximum 500 columns per table
- Column names must be unique within a table
- Handle basic validation (type checking)

---

## What We're Evaluating

1. **Project structure & code**
   - Is there a clear readme with _working_ instructions for how to run the code locally OR against a deployed instance
   - Can we run the code + our internal automated tests against the deliverable?

1. **Schema Design**
   - What are the tradeoffs of your approach?
   - What does the backend data storage look like and why was that chosen

2. **API Design**
   - RESTful design and endpoint structure. Matches the API spec above
   - Request/response formats. HTTP statuses as expected
   - Error handling

4. **Code Quality**
   - Clean, readable code
   - Basic error handling
   - Simple tests (bonus)

---

## Deliverables

1. **Code**: Working implementation - If its not fully complete, include comments on what remains
2. **README**:
   - Setup instructions
   - API documentation with example requests
   - Design decisions (diagram(s), explanations, etc.)
   - Known limitations
3. **Example**: A simple script or curl commands showing the APIs in action

## Bonus Points

- Basic filtering on GET endpoint (e.g., `?filter[name]=Alice`)
- A few unit tests
- Docker setup for easy running

---

## Notes

- Focus on core functionality over edge cases
- We value clear thinking + explanations over perfect code
- Document any assumptions you make

# Good luck!