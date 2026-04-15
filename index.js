const express = require("express");
const {
  getGreeting,
  getTableSchema,
  createTableRecord,
  insertRow,
  getRows,
  updateRow,
  deleteRow,
  deleteTable,
  patchSchema,
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

    // Parse filter query parameters: ?filter[colName]=value becomes {colName: value}
    const filters = {};
    for (const key of Object.keys(req.query)) {
      if (key.startsWith("filter[") && key.endsWith("]")) {
        const colName = key.slice(7, -1); // extract "colName" from "filter[colName]"
        filters[colName] = req.query[key];
      }
    }

    const rows = await getRows(table_id, filters);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.patch("/tables/:table_id/schema", async (req, res, next) => {
  try {
    const { table_id } = req.params;
    const { add, remove, rename } = req.body;

    // Validate add columns
    if (add) {
      if (!Array.isArray(add)) {
        return res.status(400).json({ error: "add must be an array" });
      }
      for (const col of add) {
        if (!col.name || typeof col.name !== "string" || col.name.length === 0) {
          return res.status(400).json({ error: "Column name must be a non-empty string" });
        }
        if (col.name.length > 255) {
          return res.status(400).json({ error: `Column name too long: ${col.name}` });
        }
        if (!["string", "number", "boolean"].includes(col.type)) {
          return res.status(400).json({ error: `Invalid column type: ${col.type}` });
        }
      }
    }

    // Validate remove columns
    if (remove) {
      if (!Array.isArray(remove)) {
        return res.status(400).json({ error: "remove must be an array" });
      }
      for (const colName of remove) {
        if (typeof colName !== "string" || colName.length === 0) {
          return res.status(400).json({ error: "Column name must be a non-empty string" });
        }
      }
    }

    // Validate rename columns
    if (rename) {
      if (!Array.isArray(rename)) {
        return res.status(400).json({ error: "rename must be an array" });
      }
      for (const { oldName, newName } of rename) {
        if (!oldName || typeof oldName !== "string" || oldName.length === 0) {
          return res.status(400).json({ error: "oldName must be a non-empty string" });
        }
        if (!newName || typeof newName !== "string" || newName.length === 0) {
          return res.status(400).json({ error: "newName must be a non-empty string" });
        }
        if (newName.length > 255) {
          return res.status(400).json({ error: `Column name too long: ${newName}` });
        }
      }
    }

    // Load current schema to validate remove/rename operations
    const schema = await getTableSchema(table_id);
    if (!schema) {
      return res.status(404).json({ error: "Table not found" });
    }
    const schemaMap = new Map(schema.map(col => [col.name, col]));

    // Validate remove columns exist
    if (remove) {
      for (const colName of remove) {
        if (!schemaMap.has(colName)) {
          return res.status(400).json({ error: `Column does not exist: ${colName}` });
        }
      }
    }

    // Validate rename columns exist
    if (rename) {
      for (const { oldName, newName } of rename) {
        if (!schemaMap.has(oldName)) {
          return res.status(400).json({ error: `Column does not exist: ${oldName}` });
        }
        if (schemaMap.has(newName)) {
          return res.status(400).json({ error: `Column already exists: ${newName}` });
        }
      }
    }

    // Validate add columns don't already exist
    if (add) {
      for (const col of add) {
        if (schemaMap.has(col.name)) {
          return res.status(400).json({ error: `Column already exists: ${col.name}` });
        }
      }
    }

    // Validate total column count won't exceed 500
    const removeCount = remove ? remove.length : 0;
    const addCount = add ? add.length : 0;
    const newColumnCount = schema.length - removeCount + addCount;
    if (newColumnCount > 500) {
      return res.status(400).json({ error: `Max 500 columns per table (would have ${newColumnCount})` });
    }

    const columns = await patchSchema(table_id, { add, remove, rename });
    res.json({ id: table_id, columns });
  } catch (err) {
    next(err);
  }
});

app.put("/tables/:table_id/rows/:row_id", async (req, res, next) => {
  try {
    const { table_id, row_id } = req.params;
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

    const row = await updateRow(table_id, row_id, values);
    if (!row) {
      return res.status(404).json({ error: "Row not found" });
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

app.delete("/tables/:table_id/rows/:row_id", async (req, res, next) => {
  try {
    const { table_id, row_id } = req.params;

    const deleted = await deleteRow(table_id, row_id);
    if (!deleted) {
      return res.status(404).json({ error: "Row not found" });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.delete("/tables/:table_id", async (req, res, next) => {
  try {
    const { table_id } = req.params;

    const deleted = await deleteTable(table_id);
    if (!deleted) {
      return res.status(404).json({ error: "Table not found" });
    }

    res.status(204).send();
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
