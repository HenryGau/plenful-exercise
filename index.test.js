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
