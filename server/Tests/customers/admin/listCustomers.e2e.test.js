const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/admin/customers (E2E)", () => {
  /**
   * =========================
   * AUTH
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).get("/api/admin/customers");
    expect(res.status).toBe(401);
  });

  test("403 without customers.read permission", async () => {
    const driver = await createUser({ role: "driver" });

    const login = await request(app).post("/api/auth/login").send({
      email: driver.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * SUCCESS
   * =========================
   */

  test("200 admin can list customers", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.customers)).toBe(true);
  });

  test("200 returns pagination meta", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.body).toHaveProperty("meta");
    expect(res.body.meta).toHaveProperty("page");
    expect(res.body.meta).toHaveProperty("pageSize");
    expect(res.body.meta).toHaveProperty("total");
    expect(res.body.meta).toHaveProperty("totalPages");
  });

  test("200 supports custom page and pageSize", async () => {
    const admin = await createUser({ role: "admin" });

    // seed customers
    await request(app).post("/api/customers/guest").send({
      email: "page1@test.com",
      firstName: "Page",
      lastName: "One",
    });

    await request(app).post("/api/customers/guest").send({
      email: "page2@test.com",
      firstName: "Page",
      lastName: "Two",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers?page=1&pageSize=1")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customers.length).toBeLessThanOrEqual(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(1);
  });

  test("200 supports search by email", async () => {
    const admin = await createUser({ role: "admin" });

    await request(app).post("/api/customers/guest").send({
      email: "searchme@test.com",
      firstName: "Search",
      lastName: "Target",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers?search=searchme")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customers.length).toBe(1);
    expect(res.body.data.customers[0].email).toBe("searchme@test.com");
  });

  test("200 supports search by firstName or lastName", async () => {
    const admin = await createUser({ role: "admin" });

    await request(app).post("/api/customers/guest").send({
      email: "name@test.com",
      firstName: "UniqueFirst",
      lastName: "UniqueLast",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers?search=UniqueFirst")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customers.length).toBe(1);
  });

  test("200 returns empty list when no matches", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers?search=does-not-exist")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customers).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  /**
   * =========================
   * RESPONSE SHAPE
   * =========================
   */

  test("returns consistent response structure", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("data.customers");
    expect(res.body).toHaveProperty("meta");
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("customers do not expose internal fields", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers")
      .set("Cookie", getSetCookieHeader(login));

    res.body.data.customers.forEach((customer) => {
      expect(customer.__v).toBeUndefined();
      expect(customer.password).toBeUndefined();
      expect(customer.createdBy).toBeUndefined();
    });
  });
});
