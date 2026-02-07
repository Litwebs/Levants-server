const request = require("supertest");
const app = require("../../testApp");

describe("GET /api/products/:productId (PUBLIC)", () => {
  test("404 for archived product", async () => {
    const res = await request(app).get(
      "/api/products/64f000000000000000000000",
    );

    expect(res.status).toBe(404);
  });
});
