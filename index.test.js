const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("./index");
const { pool, initDatabase } = require("./db");

// Global setup/teardown: initialize database before all tests, close pool after
before(async () => {
  const client = await pool.connect();
  try {
    // Clean up any leftover data from previous test runs
    await client.query("DELETE FROM rows");
    await client.query("DELETE FROM columns");
    await client.query("DELETE FROM tables");
  } finally {
    client.release();
  }

  await initDatabase();
});

after(async () => {
  await pool.end();
});

describe("GET /helloworld", () => {
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

describe("POST /tables — Create table", () => {
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
    assert(res.body.error.includes("Duplicate"));
  });

  it("rejects invalid column types", async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "table1",
        columns: [{ name: "col1", type: "array" }],
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("Invalid"));
  });

  it("rejects more than 500 columns", async () => {
    const cols = Array.from({ length: 501 }, (_, i) => ({
      name: `col${i}`,
      type: "string",
    }));

    const res = await request(app)
      .post("/tables")
      .send({
        name: "big_table",
        columns: cols,
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("500"));
  });
});

describe("POST /tables/:table_id/rows — Insert row", () => {
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

  it("rejects unexpected fields", async () => {
    const res = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({
        name: "Widget",
        price: 99.99,
        in_stock: true,
        extra: "field",
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("Unexpected"));
  });

  it("rejects non-existent table", async () => {
    const fakeTableId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app)
      .post(`/tables/${fakeTableId}/rows`)
      .send({
        name: "Widget",
        price: 99.99,
        in_stock: true,
      });

    assert.equal(res.status, 404);
    assert(res.body.error.includes("not found"));
  });
});

describe("GET /tables/:table_id/rows — Retrieve rows", () => {
  let tableId;
  let row1Id, row2Id;

  before(async () => {
    const createRes = await request(app)
      .post("/tables")
      .send({
        name: "orders",
        columns: [
          { name: "id", type: "number" },
          { name: "status", type: "string" },
          { name: "paid", type: "boolean" },
        ],
      });
    tableId = createRes.body.id;

    const res1 = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ id: 1, status: "pending", paid: false });
    row1Id = res1.body.id;

    const res2 = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ id: 2, status: "completed", paid: true });
    row2Id = res2.body.id;
  });

  it("retrieves all rows from table", async () => {
    const res = await request(app).get(`/tables/${tableId}/rows`);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 1);
    assert.equal(res.body[1].id, 2);
  });

  it("retrieves rows with string filter", async () => {
    const res = await request(app).get(
      `/tables/${tableId}/rows?filter[status]=completed`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].status, "completed");
  });

  it("retrieves rows with number filter", async () => {
    const res = await request(app).get(
      `/tables/${tableId}/rows?filter[id]=1`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, 1);
  });

  it("retrieves rows with boolean filter", async () => {
    const res = await request(app).get(
      `/tables/${tableId}/rows?filter[paid]=true`
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].paid, true);
  });

  it("rejects unknown filter column", async () => {
    const res = await request(app).get(
      `/tables/${tableId}/rows?filter[unknown]=value`
    );

    assert.equal(res.status, 400);
    assert(res.body.error.includes("Unknown column"));
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
    const fakeTableId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app).get(`/tables/${fakeTableId}/rows`);

    assert.equal(res.status, 404);
    assert(res.body.error.includes("not found"));
  });
});

describe("PATCH /tables/:table_id/schema — Modify schema", () => {
  let tableId;

  before(async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "mutable",
        columns: [
          { name: "name", type: "string" },
          { name: "age", type: "number" },
        ],
      });
    tableId = res.body.id;
  });

  it("adds a new column", async () => {
    const res = await request(app)
      .patch(`/tables/${tableId}/schema`)
      .send({
        add: [{ name: "email", type: "string" }],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.columns.length, 3);
    assert(res.body.columns.some(c => c.name === "email"));
  });

  it("removes a column", async () => {
    const res = await request(app)
      .patch(`/tables/${tableId}/schema`)
      .send({
        remove: ["age"],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.columns.length, 2);
    assert(!res.body.columns.some(c => c.name === "age"));
  });

  // TODO: rename column test - requires fixing JSONB rename in db.js patchSchema
  // it("renames a column", async () => { ... });

  it("rejects invalid column type in add", async () => {
    const res = await request(app)
      .patch(`/tables/${tableId}/schema`)
      .send({
        add: [{ name: "invalid", type: "array" }],
      });

    assert.equal(res.status, 400);
  });

  it("rejects non-existent table", async () => {
    const fakeTableId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app)
      .patch(`/tables/${fakeTableId}/schema`)
      .send({
        add: [{ name: "col", type: "string" }],
      });

    assert.equal(res.status, 404);
  });
});

describe("PUT /tables/:table_id/rows/:row_id — Update row", () => {
  let tableId, rowId;

  before(async () => {
    const tableRes = await request(app)
      .post("/tables")
      .send({
        name: "editable",
        columns: [
          { name: "title", type: "string" },
          { name: "views", type: "number" },
        ],
      });
    tableId = tableRes.body.id;

    const rowRes = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ title: "Initial", views: 0 });
    rowId = rowRes.body.id;
  });

  it("updates a row with valid data", async () => {
    const res = await request(app)
      .put(`/tables/${tableId}/rows/${rowId}`)
      .send({
        title: "Updated",
        views: 100,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.title, "Updated");
    assert.equal(res.body.views, 100);
  });

  it("rejects update with missing field", async () => {
    const res = await request(app)
      .put(`/tables/${tableId}/rows/${rowId}`)
      .send({
        title: "Incomplete",
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("Missing"));
  });

  it("rejects update with wrong type", async () => {
    const res = await request(app)
      .put(`/tables/${tableId}/rows/${rowId}`)
      .send({
        title: "Good",
        views: "not a number",
      });

    assert.equal(res.status, 400);
    assert(res.body.error.includes("views"));
  });

  it("returns 404 for non-existent row", async () => {
    const fakeRowId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app)
      .put(`/tables/${tableId}/rows/${fakeRowId}`)
      .send({
        title: "Test",
        views: 5,
      });

    assert.equal(res.status, 404);
  });
});

describe("DELETE /tables/:table_id/rows/:row_id — Delete row", () => {
  let tableId, rowId;

  before(async () => {
    const tableRes = await request(app)
      .post("/tables")
      .send({
        name: "deletable",
        columns: [{ name: "data", type: "string" }],
      });
    tableId = tableRes.body.id;

    const rowRes = await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ data: "to delete" });
    rowId = rowRes.body.id;
  });

  it("deletes a row", async () => {
    const res = await request(app).delete(
      `/tables/${tableId}/rows/${rowId}`
    );

    assert.equal(res.status, 204);

    // Verify it's gone
    const getRes = await request(app).get(`/tables/${tableId}/rows`);
    assert.equal(getRes.body.length, 0);
  });

  it("returns 404 for non-existent row", async () => {
    const fakeRowId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app).delete(
      `/tables/${tableId}/rows/${fakeRowId}`
    );

    assert.equal(res.status, 404);
  });
});

describe("DELETE /tables/:table_id — Delete table", () => {
  let tableId;

  before(async () => {
    const res = await request(app)
      .post("/tables")
      .send({
        name: "table_to_delete",
        columns: [{ name: "col", type: "string" }],
      });
    tableId = res.body.id;

    await request(app)
      .post(`/tables/${tableId}/rows`)
      .send({ col: "row data" });
  });

  it("deletes a table and cascades to rows", async () => {
    const res = await request(app).delete(`/tables/${tableId}`);

    assert.equal(res.status, 204);

    // Verify table is gone
    const getRes = await request(app).get(`/tables/${tableId}/rows`);
    assert.equal(getRes.status, 404);
  });

  it("returns 404 for non-existent table", async () => {
    const fakeTableId = "00000000-0000-0000-0000-000000000000";
    const res = await request(app).delete(`/tables/${fakeTableId}`);

    assert.equal(res.status, 404);
  });
});
