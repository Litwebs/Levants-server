const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

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
        thumbnailImage: "/milk.jpg",
      });

    expect(res.status).toBe(201);
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
        thumbnailImage: "/cheese.jpg",
      });

    const res = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Cheese",
        category: "Dairy",
        description: "Duplicate",
        thumbnailImage: "/cheese.jpg",
      });

    expect(res.status).toBe(409);
  });
});
