const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("./index");
const { pool, initDatabase } = require("./db");

describe("GET /helloworld", () => {
  before(async () => {
    await initDatabase();
  });

  after(async () => {
    await pool.end();
  });

  it("returns 200 with greeting from database", async () => {
    const res = await request(app).get("/helloworld");

    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(res.body.message, "Hello, World!");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/unknown");

    assert.equal(res.status, 404);
  });
});

describe("POST /tables", () => {
  it("creates a table with valid input", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "users",
        columns: [
          { name: "username", type: "string" },
          { name: "age", type: "number" },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, "users");
    assert.equal(res.body.columns.length, 2);
    assert(res.body.id);
  });

  it("rejects missing name", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        columns: [{ name: "col1", type: "string" }],
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("name"));
  });

  it("rejects non-string name", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: 123,
        columns: [{ name: "col1", type: "string" }],
      });

    assert.equal(res.status, 400);
  });

  it("rejects missing or empty columns", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "table1",
        columns: [],
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("columns"));
  });

  it("rejects duplicate column names", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "table1",
        columns: [
          { name: "col1", type: "string" },
          { name: "col1", type: "number" },
        ],
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("unique"));
  });

  it("rejects invalid column types", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "table1",
        columns: [{ name: "col1", type: "array" }],
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("Invalid type"));
  });
});

describe("POST /tables/:table_id/rows", () => {
  let tableId;

  before(async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "products",
        columns: [
          { name: "name", type: "string" },
          { name: "price", type: "number" },
          { name: "in_stock", type: "boolean" },
        ],
      });
    tableId = res.body.id;
  });

  it("inserts a row with valid data", async () => {
    const res = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({
        name: "Widget",
        price: 99.99,
        in_stock: true,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, "Widget");
    assert.equal(res.body.price, 99.99);
    assert.equal(res.body.in_stock, true);
    assert(res.body.id);
  });

  it("rejects row with missing field", async () => {
    const res = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({
        name: "Widget",
        price: 99.99,
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("in_stock"));
  });

  it("rejects row with wrong type", async () => {
    const res = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({
        name: "Widget",
        price: "99.99",
        in_stock: true,
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("price"));
  });

  it("rejects non-existent table", async () => {
    const res = await request(app)
      .post("/tables/nonexistent/rows")
      .send({
        name: "Widget",
        price: 99.99,
        in_stock: true,
      });

    assert.equal(res.status, 404);
    assert(res.body.error.includes("not found"));
  });
});

describe("GET /tables/:table_id/rows", () => {
  let tableId;

  before(async () => {
    const createRes = await request(app)
      .post("/tables")
      .send({
        name: "orders",
        columns: [
          { name: "id", type: "number" },
          { name: "status", type: "string" },
        ],
      });
    tableId = createRes.body.id;

    await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ id: 1, status: "pending" });

    await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ id: 2, status: "completed" });
  });

  it("retrieves all rows from table", async () => {
    const res = await request(app).get(`/tables/${tableId}/rows`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 1);
    assert.equal(res.body[1].id, 2);
  });

  it("returns empty array for table with no rows", async () => {
    const createRes = await request(app)
      .post("/tables")
      .send({
        name: "empty_table",
        columns: [{ name: "col1", type: "string" }],
      });

    const res = await request(app).get(`/tables/${createRes.body.id}/rows`);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it("rejects non-existent table", async () => {
    const res = await request(app).get("/tables/nonexistent/rows");

    assert.equal(res.status, 404);
    assert(res.body.error.includes("not found"));
  });
});
