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

module.exports = { pool, initDatabase, getGreeting };
