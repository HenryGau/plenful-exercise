# Coding Interview – Part 1 (30 min)

## Overview

Build a minimal REST API for a "data table" system — think of it as a tiny Airtable.
Users can create tables with custom schemas and insert/retrieve rows.

**Stack:** Any backend language/framework you're comfortable with.
No frontend needed. Use SQLite (or any SQL database) for persistence — no in-memory stores.

---

## What to Build (3 endpoints)

**1. Create Table**
POST /tables
Body: { "name": "customers", "columns": [{ "name": "age", "type": "number" }, ...] }
- Column types: string, number, boolean (limited to 3 types)
- Column names must be unique within a table
- Returns a table ID

**2. Insert Row**
POST /tables/{table_id}/rows
Body: { "name": "Alice", "age": 30, "active": true }
- Validate values match declared column types
- Returns the created row with an ID

**3. Get Rows**
GET /tables/{table_id}/rows
- Returns all rows for that table

---

## Requirements
 - non auth required
 - use in memmory - datastructure for this requirement, UUID for table ID, UUID is generated on application side
 - basic validations when create table and insert row
 - use NodeJS with JavaScript for this application  

## Deliverables

1. Working code with a README showing how to run it locally
2. A few curl commands (or a script) demonstrating the three endpoints
3. A short note (a few sentences is fine) on:
   - How you're storing the data in SQL and why
   - What tradeoffs you made and what you'd do differently with more time
