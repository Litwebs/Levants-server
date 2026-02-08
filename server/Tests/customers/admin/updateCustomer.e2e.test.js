const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT /api/admin/customers/:customerId (E2E)", () => {
  /**
   * =========================
   * AUTH / RBAC
   * =========================
   */

  test("401 when not authenticated", async () => {
    const res = await request(app).put(
      "/api/admin/customers/64f000000000000000000000",
    );

    expect(res.status).toBe(401);
  });

  test("403 when not admin", async () => {
    const staff = await createUser({ role: "staff" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "update@test.com",
      firstName: "Old",
      lastName: "Name",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ firstName: "Hacked" });

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when customerId is invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/admin/customers/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login))
      .send({ firstName: "Test" });

    expect(res.status).toBe(400);
  });

  test("400 when body is not an object", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "body@test.com",
      firstName: "Body",
      lastName: "Test",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send("not-an-object");

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
      .put("/api/admin/customers/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login))
      .send({ firstName: "Nope" });

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * SUCCESS PATHS
   * =========================
   */

  test("200 admin can update customer info", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "edit@test.com",
      firstName: "Before",
      lastName: "Edit",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        firstName: "After",
        phone: "07000000000",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.firstName).toBe("After");
    expect(res.body.data.customer.phone).toBe("07000000000");
  });

  test("200 does not overwrite fields not provided", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "partial@test.com",
      firstName: "Keep",
      lastName: "Last",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ firstName: "Changed" });

    expect(res.body.data.customer.firstName).toBe("Changed");
    expect(res.body.data.customer.lastName).toBe("Last");
  });

  test("200 can add address and mark it as default", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "address-update@test.com",
      firstName: "Address",
      lastName: "User",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        address: {
          line1: "10 Road",
          city: "Bradford",
          postcode: "BD1 2AA",
          country: "UK",
        },
      });

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
      email: "shape@test.com",
      firstName: "Shape",
      lastName: "Test",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ phone: "07111111111" });

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("data.customer");
    expect(res.body.data.customer).toHaveProperty("_id");
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not expose internal fields", async () => {
    const admin = await createUser({ role: "admin" });

    const customerRes = await request(app).post("/api/customers/guest").send({
      email: "secure-update@test.com",
      firstName: "Secure",
      lastName: "User",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/admin/customers/${customerRes.body.data.customer._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ phone: "07999999999" });

    const customer = res.body.data.customer;

    expect(customer.__v).toBeUndefined();
    expect(customer.password).toBeUndefined();
    expect(customer.createdBy).toBeUndefined();
  });
});
