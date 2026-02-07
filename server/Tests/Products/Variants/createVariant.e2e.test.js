const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("POST /api/admin/variants/products/:productId/variants (E2E)", () => {
  test("creates variant and stripe price", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const product = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Cream",
        category: "Dairy",
        description: "Cream",
        thumbnailImage: "/cream.jpg",
      });

    const productId = product.body.data.product._id;

    const res = await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "500ml",
        sku: "CREAM-500",
        price: 2.99,
        stockQuantity: 100,
        thumbnailImage: "/variant-a.jpg",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.variant.stripeProductId).toBeDefined();
    expect(res.body.data.variant.stripePriceId).toBeDefined();
  });
});
