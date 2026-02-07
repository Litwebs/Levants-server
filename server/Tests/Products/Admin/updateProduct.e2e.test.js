const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT / DELETE /api/admin/products/:productId (E2E)", () => {
  test("admin updates product", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const created = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Butter",
        category: "Dairy",
        description: "Butter",
        thumbnailImage: "/butter.jpg",
      });

    const productId = created.body.data.product._id;

    const res = await request(app)
      .put(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Salted Butter" });

    expect(res.status).toBe(200);
    expect(res.body.data.product.name).toBe("Salted Butter");
  });

  test("admin archives product", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const created = await request(app)
      .post("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "Yoghurt",
        category: "Dairy",
        description: "Yoghurt",
        thumbnailImage: "/yoghurt.jpg",
      });

    const productId = created.body.data.product._id;

    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.product.status).toBe("archived");
  });
});
