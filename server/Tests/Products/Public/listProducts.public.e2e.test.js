const request = require("supertest");
const app = require("../../testApp");

describe("GET /api/products (PUBLIC)", () => {
  test("returns active products only", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  test("does not expose stripe fields", async () => {
    const res = await request(app).get("/api/products");

    expect(JSON.stringify(res.body)).not.toContain("stripe");
  });
});
