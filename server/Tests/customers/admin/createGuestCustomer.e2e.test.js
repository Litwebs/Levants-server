const request = require("supertest");
const app = require("../../testApp");

describe("POST /api/customers/guest (E2E)", () => {
  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when required fields missing", async () => {
    const res = await request(app)
      .post("/api/customers/guest")
      .send({ email: "test@test.com" });

    expect(res.status).toBe(400);
  });

  test("400 when email is missing", async () => {
    const res = await request(app).post("/api/customers/guest").send({
      firstName: "John",
      lastName: "Smith",
    });

    expect(res.status).toBe(400);
  });

  test("400 when email is invalid", async () => {
    const res = await request(app).post("/api/customers/guest").send({
      email: "not-an-email",
      firstName: "John",
      lastName: "Smith",
    });

    expect(res.status).toBe(400);
  });

  test("400 when address is not an object", async () => {
    const res = await request(app).post("/api/customers/guest").send({
      email: "badaddress@test.com",
      firstName: "John",
      lastName: "Smith",
      address: "not-an-object",
    });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * SUCCESS PATHS
   * =========================
   */

  test("200 creates a new guest customer", async () => {
    const res = await request(app)
      .post("/api/customers/guest")
      .send({
        email: "guest1@test.com",
        firstName: "John",
        lastName: "Smith",
        phone: "07123456789",
        address: {
          line1: "12 High Street",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customer.email).toBe("guest1@test.com");
    expect(res.body.data.customer.isGuest).toBe(true);
    expect(res.body.data.customer.addresses.length).toBe(1);
    expect(res.body.data.customer.addresses[0].isDefault).toBe(true);
  });

  test("200 reuses existing customer with same email", async () => {
    await request(app).post("/api/customers/guest").send({
      email: "guest2@test.com",
      firstName: "John",
      lastName: "Smith",
    });

    const res = await request(app).post("/api/customers/guest").send({
      email: "guest2@test.com",
      firstName: "Changed",
      lastName: "Name",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe("guest2@test.com");
  });

  test("200 adds a new address to existing customer and switches default", async () => {
    await request(app)
      .post("/api/customers/guest")
      .send({
        email: "guest-address@test.com",
        firstName: "John",
        lastName: "Smith",
        address: {
          line1: "Old Address",
          city: "Leeds",
          postcode: "LS1 1AA",
          country: "UK",
        },
      });

    const res = await request(app)
      .post("/api/customers/guest")
      .send({
        email: "guest-address@test.com",
        address: {
          line1: "New Address",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    const addresses = res.body.data.customer.addresses;

    expect(res.status).toBe(200);
    expect(addresses.length).toBe(2);
    expect(addresses[1].isDefault).toBe(true);
    expect(addresses[0].isDefault).toBe(false);
  });

  test("200 does not require firstName/lastName when customer already exists", async () => {
    await request(app).post("/api/customers/guest").send({
      email: "existing@test.com",
      firstName: "John",
      lastName: "Smith",
    });

    const res = await request(app).post("/api/customers/guest").send({
      email: "existing@test.com",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe("existing@test.com");
  });

  /**
   * =========================
   * RESPONSE SHAPE
   * =========================
   */

  test("returns consistent response structure", async () => {
    const res = await request(app).post("/api/customers/guest").send({
      email: "shape@test.com",
      firstName: "Shape",
      lastName: "Test",
    });

    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("data.customer");
    expect(res.body.data.customer).toHaveProperty("_id");
    expect(res.body.data.customer).toHaveProperty("email");
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not expose internal fields", async () => {
    const res = await request(app).post("/api/customers/guest").send({
      email: "guest3@test.com",
      firstName: "Safe",
      lastName: "User",
    });

    const customer = res.body.data.customer;

    expect(customer.__v).toBeUndefined();
    expect(customer.createdBy).toBeUndefined();
  });
});
