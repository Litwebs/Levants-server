// Tests/Products/Admin/createProduct.e2e.test.js
const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

// ✅ MOCK FILE SERVICE (correct path for your project structure)
jest.mock("../../../services/files.service", () => ({
  uploadAndCreateFile: jest.fn(async () => ({
    success: true,
    data: { _id: "507f191e810c19729de860ea" },
  })),
  deleteFileIfOrphaned: jest.fn(async () => true),
}));

// 1x1 png data url (tiny + valid)
const ONE_BY_ONE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=";

describe("POST /api/admin/products (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).post("/api/admin/products");
    expect(res.status).toBe(401);
  });

  test("403 without products.create permission", async () => {
    const staff = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Milk" });

    expect(res.status).toBe(403);
  });

  test("400 when payload invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({});

    expect(res.status).toBe(400);
  });

  test("201 admin creates product", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Fresh Milk",
        category: "Dairy",
        description: "Organic milk",
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.product.slug).toBe("fresh-milk");
  });

  test("409 duplicate product name", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Cheese",
        category: "Dairy",
        description: "Cheese",
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    const res = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Cheese",
        category: "Dairy",
        description: "Duplicate",
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    expect(res.status).toBe(409);
  });
});
