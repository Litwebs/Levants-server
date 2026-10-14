const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

jest.mock("../../../services/files.service", () => ({
  uploadAndCreateFile: jest.fn(async () => ({
    success: true,
    data: { _id: "507f191e810c19729de860ea" },
  })),
  deleteFileIfOrphaned: jest.fn(async () => true),
}));

const ONE_BY_ONE_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2G0qQAAAAASUVORK5CYII=";

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
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    expect(created.status).toBe(201);
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
        status: "active",
        thumbnailImage: ONE_BY_ONE_PNG_BASE64,
      });

    expect(created.status).toBe(201);
    const productId = created.body.data.product._id;

    const res = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.product.status).toBe("archived");
  });
});
