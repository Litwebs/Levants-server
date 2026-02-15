const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

// ✅ Mock file service (correct path)
jest.mock("../../../services/files.service", () => ({
  uploadAndCreateFile: jest.fn(async () => ({
    success: true,
    data: { _id: "507f191e810c19729de860ea" },
  })),
  deleteFileIfOrphaned: jest.fn(async () => true),
}));

// tiny valid base64 image
const ONE_BY_ONE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=";

describe("GET /api/admin/products/:productId (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/products/64f000000000000000000000",
    );
    expect(res.status).toBe(401);
  });

  test("403 when lacking products.read permission", async () => {
    const driver = await createUser({ role: "driver" });

    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("400 when productId is invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  test("404 when product does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  test("200 admin can fetch product with variants", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    // Create product (must use base64)
    const productRes = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Admin Product",
        category: "Dairy",
        description: "Test product",
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    expect(productRes.status).toBe(201);
    const productId = productRes.body.data.product._id;

    // Create variant (match your mounted route)
    await request(app)
      .post(`/api/admin/variants/products/${productId}/variants`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Variant A",
        sku: "GET-VAR-1",
        price: 2.99,
        stockQuantity: 20,
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    const res = await request(app)
      .get(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product._id).toBe(productId);
  });
});
