const express = require("express");
const {
  getGreeting,
  getTableSchema,
  createTableRecord,
  insertRow,
  getRows,
} = require("./db");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  console.log(req.method, req.path);
  next();
});

app.get("/helloworld", async (req, res, next) => {
  try {
    const message = await getGreeting();
    res.json({ message });
  } catch (err) {
    next(err);
  }
});

app.post("/tables", async (req, res, next) => {
  try {
    const { name, columns } = req.body;

    // Validate name
    if (!name || typeof name !== "string" || name.length === 0 || name.length > 255) {
      return res.status(400).json({ error: "name must be a non-empty string (max 255 chars)" });
    }

    // Validate columns
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "columns must be a non-empty array" });
    }

    if (columns.length > 500) {
      return res.status(400).json({ error: "Max 500 columns per table" });
    }

    // Validate each column
    const colNames = new Set();
    for (const col of columns) {
      if (!col.name || typeof col.name !== "string" || col.name.length === 0) {
        return res.status(400).json({ error: "Column name must be a non-empty string" });
      }
      if (col.name.length > 255) {
        return res.status(400).json({ error: `Column name too long: ${col.name}` });
      }
      if (colNames.has(col.name)) {
        return res.status(400).json({ error: `Duplicate column name: ${col.name}` });
      }
      if (!["string", "number", "boolean"].includes(col.type)) {
        return res.status(400).json({ error: `Invalid column type: ${col.type}` });
      }
      colNames.add(col.name);
    }

    const table = await createTableRecord(name, columns);
    res.status(201).json(table);
  } catch (err) {
    next(err);
  }
});

app.post("/tables/:table_id/rows", async (req, res, next) => {
  try {
    const { table_id } = req.params;
    const values = req.body;

    // Load schema to validate row data
    const schema = await getTableSchema(table_id);
    if (!schema) {
      return res.status(404).json({ error: "Table not found" });
    }

    // Validate all required fields exist and have correct types
    for (const col of schema) {
      if (!(col.name in values)) {
        return res.status(400).json({ error: `Missing field: ${col.name}` });
      }

      const value = values[col.name];
      if (typeof value !== col.type) {
        return res.status(400).json({
          error: `Field "${col.name}" must be ${col.type}, got ${typeof value}`,
        });
      }
    }

    // Check for unexpected fields
    const schemaKeys = new Set(schema.map(col => col.name));
    for (const key of Object.keys(values)) {
      if (!schemaKeys.has(key)) {
        return res.status(400).json({ error: `Unexpected field: ${key}` });
      }
    }

    const row = await insertRow(table_id, values);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

app.get("/tables/:table_id/rows", async (req, res, next) => {
  try {
    const { table_id } = req.params;
    const filters = req.query.filter || {};

    const rows = await getRows(table_id, filters);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

if (require.main === module) {
  const { initDatabase } = require("./db");
  const port = process.env.PORT || 3000;

  initDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    })
    .catch((err) => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}

module.exports = app;
