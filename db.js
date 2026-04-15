const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "helloworld",
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Legacy greetings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS greetings (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await client.query("SELECT COUNT(*) FROM greetings");
    if (result.rows[0].count === "0") {
      await client.query(
        "INSERT INTO greetings (message) VALUES ($1)",
        ["Hello, World!"]
      );
    }

    // Tables API schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS columns (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id   UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        name       TEXT        NOT NULL,
        type       TEXT        NOT NULL CHECK (type IN ('string', 'number', 'boolean')),
        position   INTEGER     NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT columns_table_id_name_key UNIQUE (table_id, name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rows (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        table_id   UUID        NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        data       JSONB       NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rows_table_id ON rows(table_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rows_data_gin ON rows USING GIN (data)
    `);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getGreeting() {
  const result = await pool.query(
    "SELECT message FROM greetings ORDER BY created_at DESC LIMIT 1"
  );
  return result.rows[0]?.message || "Hello, World!";
}

// ── Tables API Helper Functions ────────────────────────────────────────────

/**
 * Get table schema (column definitions) for a table.
 * Returns array of {id, name, type, position} or null if table not found.
 */
async function getTableSchema(tableId) {
  const result = await pool.query(
    "SELECT id, name, type, position FROM columns WHERE table_id = $1 ORDER BY position ASC",
    [tableId]
  );

  if (result.rows.length === 0) {
    // Check if table exists
    const tableCheck = await pool.query("SELECT id FROM tables WHERE id = $1", [tableId]);
    if (tableCheck.rows.length === 0) {
      return null; // Table doesn't exist
    }
  }

  return result.rows;
}

/**
 * Create a new table with columns.
 * Returns {id, name, columns, rows: []} on success.
 */
async function createTableRecord(name, columns) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert table
    const tableResult = await client.query(
      "INSERT INTO tables (name) VALUES ($1) RETURNING id, name, created_at",
      [name]
    );
    const tableId = tableResult.rows[0].id;

    // Insert columns
    const columnResults = [];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const colResult = await client.query(
        "INSERT INTO columns (table_id, name, type, position) VALUES ($1, $2, $3, $4) RETURNING id, name, type, position",
        [tableId, col.name, col.type, i]
      );
      columnResults.push(colResult.rows[0]);
    }

    await client.query("COMMIT");

    return {
      id: tableId,
      name: tableResult.rows[0].name,
      columns: columnResults,
      rows: [],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Insert a row into a table.
 * Returns {id, ...data, created_at} on success.
 */
async function insertRow(tableId, data) {
  const result = await pool.query(
    "INSERT INTO rows (table_id, data) VALUES ($1, $2) RETURNING id, data, created_at",
    [tableId, JSON.stringify(data)]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error(`Failed to insert row`), { status: 500 });
  }

  const row = result.rows[0];
  return {
    id: row.id,
    ...row.data,
    created_at: row.created_at,
  };
}

/**
 * Get rows from a table with optional filtering.
 * Filters is an object: {colName: value, ...}
 * Filter column names are validated against schema (whitelist).
 * Returned JSONB data is validated against schema before returning to client.
 * Returns array of {id, ...data, created_at}.
 */
async function getRows(tableId, filters = {}) {
  // Load schema to validate filter keys and validate returned data
  const schema = await getTableSchema(tableId);
  if (schema === null) {
    throw Object.assign(new Error(`Table not found`), { status: 404 });
  }

  const schemaMap = new Map(schema.map(col => [col.name, col]));

  // Validate filter column names (whitelist check only, not types)
  for (const colName of Object.keys(filters)) {
    if (!schemaMap.has(colName)) {
      throw Object.assign(new Error(`Unknown column: ${colName}`), { status: 400 });
    }
  }

  // Build WHERE clause with whitelisted filters
  let whereClause = "WHERE table_id = $1";
  const params = [tableId];
  let paramIdx = 2;

  for (const [colName, value] of Object.entries(filters)) {
    const col = schemaMap.get(colName);

    // Build type-specific WHERE clause for filter
    if (col.type === "string") {
      whereClause += ` AND data->>'${colName}' = $${paramIdx}`;
    } else if (col.type === "number") {
      whereClause += ` AND (data->>'${colName}')::numeric = $${paramIdx}`;
    } else if (col.type === "boolean") {
      whereClause += ` AND (data->>'${colName}')::boolean = $${paramIdx}`;
    }

    params.push(value);
    paramIdx++;
  }

  const result = await pool.query(
    `SELECT id, data, created_at FROM rows ${whereClause} ORDER BY created_at ASC`,
    params
  );

  // Validate returned JSONB data against schema before returning to client
  return result.rows.map(row => {
    const validatedData = {};

    // Validate each field in the JSONB data matches schema
    for (const [key, value] of Object.entries(row.data)) {
      const col = schemaMap.get(key);
      if (!col) {
        throw Object.assign(
          new Error(`Data contains unexpected column: ${key}`),
          { status: 500 }
        );
      }

      if (typeof value !== col.type) {
        throw Object.assign(
          new Error(`Column "${key}" has wrong type: expected ${col.type}, got ${typeof value}`),
          { status: 500 }
        );
      }

      validatedData[key] = value;
    }

    return {
      id: row.id,
      ...validatedData,
      created_at: row.created_at,
    };
  });
}

/**
 * Update a row's data.
 * Returns {id, ...data, created_at} on success, or null if row not found.
 */
async function updateRow(tableId, rowId, data) {
  const result = await pool.query(
    "UPDATE rows SET data = $1 WHERE id = $2 AND table_id = $3 RETURNING id, data, created_at",
    [JSON.stringify(data), rowId, tableId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    ...row.data,
    created_at: row.created_at,
  };
}

/**
 * Delete a row.
 * Returns true if deleted, false if row not found.
 */
async function deleteRow(tableId, rowId) {
  const result = await pool.query(
    "DELETE FROM rows WHERE id = $1 AND table_id = $2",
    [rowId, tableId]
  );

  return result.rowCount > 0;
}

/**
 * Delete a table (cascades to columns and rows).
 * Returns true if deleted, false if table not found.
 */
async function deleteTable(tableId) {
  const result = await pool.query(
    "DELETE FROM tables WHERE id = $1",
    [tableId]
  );

  return result.rowCount > 0;
}

/**
 * Patch a table's schema.
 * Input: {add: [...], remove: [...], rename: [...]}
 * - add: [{name, type}, ...]
 * - remove: [colName, ...]
 * - rename: [{oldName, newName}, ...]
 * Returns updated columns array.
 */
async function patchSchema(tableId, { add = [], remove = [], rename = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify table exists
    const tableCheck = await client.query("SELECT id FROM tables WHERE id = $1", [tableId]);
    if (tableCheck.rows.length === 0) {
      throw Object.assign(new Error("Table not found"), { status: 404 });
    }

    // Add columns
    for (const col of add) {
      const checkDuplicate = await client.query(
        "SELECT id FROM columns WHERE table_id = $1 AND name = $2",
        [tableId, col.name]
      );
      if (checkDuplicate.rows.length > 0) {
        throw Object.assign(new Error(`Column already exists: ${col.name}`), { status: 409 });
      }

      const maxPos = await client.query(
        "SELECT COALESCE(MAX(position), -1) as max_pos FROM columns WHERE table_id = $1",
        [tableId]
      );
      const nextPos = maxPos.rows[0].max_pos + 1;

      await client.query(
        "INSERT INTO columns (table_id, name, type, position) VALUES ($1, $2, $3, $4)",
        [tableId, col.name, col.type, nextPos]
      );
    }

    // Remove columns (eager cleanup)
    for (const colName of remove) {
      await client.query(
        "DELETE FROM columns WHERE table_id = $1 AND name = $2",
        [tableId, colName]
      );
      await client.query(
        "UPDATE rows SET data = data - $1 WHERE table_id = $2",
        [colName, tableId]
      );
    }

    // Rename columns
    for (const { oldName, newName } of rename) {
      await client.query(
        "UPDATE columns SET name = $1 WHERE table_id = $2 AND name = $3",
        [newName, tableId, oldName]
      );
      await client.query(
        "UPDATE rows SET data = (data - $1) || jsonb_build_object($2, data->$1) WHERE table_id = $3 AND data ? $1",
        [oldName, newName, tableId]
      );
    }

    await client.query("COMMIT");

    // Return updated schema
    const result = await pool.query(
      "SELECT id, name, type, position FROM columns WHERE table_id = $1 ORDER BY position ASC",
      [tableId]
    );

    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  getGreeting,
  getTableSchema,
  createTableRecord,
  insertRow,
  getRows,
  updateRow,
  deleteRow,
  deleteTable,
  patchSchema,
};
