const { randomUUID } = require("crypto");

const VALID_TYPES = new Set(["string", "number", "boolean"]);

class Column {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
}

class Row {
  constructor(id, values) {
    this.id = id;
    Object.assign(this, values);
  }
}

const tables = new Map();

function createTable(name, columns) {
  const names = columns.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    throw Object.assign(new Error("Column names must be unique"), { status: 400 });
  }
  for (const col of columns) {
    if (!VALID_TYPES.has(col.type)) {
      throw Object.assign(new Error(`Invalid type: ${col.type}`), { status: 400 });
    }
  }
  const id = randomUUID();
  const record = {
    id,
    name,
    columns: columns.map((c) => new Column(c.name, c.type)),
    rows: [],
  };
  tables.set(id, record);
  return record;
}

function insertRow(tableId, values) {
  const table = tables.get(tableId);
  if (!table) throw Object.assign(new Error(`Table ${tableId} not found`), { status: 404 });

  for (const col of table.columns) {
    const val = values[col.name];
    if (val === undefined) {
      throw Object.assign(new Error(`Missing field: ${col.name}`), { status: 400 });
    }
    if (typeof val !== col.type) {
      throw Object.assign(new Error(`Field "${col.name}" must be ${col.type}, got ${typeof val}`), { status: 400 });
    }
  }

  const row = new Row(randomUUID(), values);
  table.rows.push(row);
  return row;
}

function getRows(tableId) {
  const table = tables.get(tableId);
  if (!table) throw Object.assign(new Error(`Table ${tableId} not found`), { status: 404 });
  return table.rows;
}

module.exports = { createTable, insertRow, getRows, Column, Row };
