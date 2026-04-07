const express = require("express");
const { getGreeting } = require("./db");
const { createTable, insertRow, getRows } = require("./store");

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

app.post("/tables", (req, res, next) => {
  try {
    const { name, columns } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name must be a non-empty string" });
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "columns must be a non-empty array" });
    }
    const table = createTable(name, columns);
    res.status(201).json(table);
  } catch (err) {
    next(err);
  }
});

app.post("/tables/:table_id/rows", (req, res, next) => {
  try {
    const { table_id } = req.params;
    const values = req.body;
    const row = insertRow(table_id, values);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

app.get("/tables/:table_id/rows", (req, res, next) => {
  try {
    const { table_id } = req.params;
    const rows = getRows(table_id);
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
