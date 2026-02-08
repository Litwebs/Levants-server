const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/admin/customers/:customerId (E2E)", () => {
  /**
   * =========================
   * AUTH / RBAC
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/customers/64f000000000000000000000",
    );
    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when customerId is invalid ObjectId", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * NOT FOUND
   * =========================
   */

  test("404 when customer does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATHS
   * =========================
   */

  test("200 admin can fetch customer", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "fetch@test.com",
      firstName: "Fetch",
      lastName: "Me",
    });

    const customerId = customerRes.body.data.customer._id;

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customerId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe("fetch@test.com");
    expect(res.body.data.customer.isGuest).toBe(true);
  });

  test("200 returns customer with addresses if present", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app)
      .post("/api/customers/guest")
      .send({
        email: "address@test.com",
        firstName: "Address",
        lastName: "User",
        address: {
          line1: "1 Street",
          city: "Leeds",
          postcode: "LS1 1AA",
          country: "UK",
        },
      });

    const customerId = customerRes.body.data.customer._id;

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customerId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.customer.addresses.length).toBe(1);
    expect(res.body.data.customer.addresses[0].isDefault).toBe(true);
  });

  /**
   * =========================
   * RESPONSE SHAPE
   * =========================
   */

  test("returns consistent response structure", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "shape-admin@test.com",
      firstName: "Shape",
      lastName: "Admin",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("data.customer");
    expect(res.body.data.customer).toHaveProperty("_id");
    expect(res.body.data.customer).toHaveProperty("email");
    expect(res.body.data.customer).toHaveProperty("firstName");
    expect(res.body.data.customer).toHaveProperty("lastName");
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not expose internal fields", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "secure@test.com",
      firstName: "Secure",
      lastName: "User",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login));

    const customer = res.body.data.customer;

    expect(customer.__v).toBeUndefined();
    expect(customer.password).toBeUndefined();
    expect(customer.createdBy).toBeUndefined();
  });
});
