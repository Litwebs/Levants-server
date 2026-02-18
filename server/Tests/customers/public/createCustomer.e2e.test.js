const request = require("supertest");
const app = require("../../testApp");

describe("POST /api/customers (PUBLIC E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("does NOT require authentication", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "John",
        lastName: "Doe",
        email: "john.auth@test.com",
        phone: "07123456789",
        address: {
          line1: "1 Test Street",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect(res.status).not.toBe(401);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when body is empty", async () => {
    const res = await request(app).post("/api/customers").send({});
    expect(res.status).toBe(400);
  });

  test("400 when email is invalid", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "John",
        lastName: "Doe",
        email: "not-an-email",
        phone: "07123456789",
        address: {
          line1: "1 Test Street",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect(res.status).toBe(400);
  });

  test("400 when required address fields are missing", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "John",
        lastName: "Doe",
        email: "address@test.com",
        phone: "07123456789",
        address: {
          city: "Bradford",
        },
      });

    expect(res.status).toBe(400);
  });

  test("400 when unknown fields are sent (strict schema)", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "John",
        lastName: "Doe",
        email: "unknown@test.com",
        phone: "07123456789",
        hackedField: "💀",
        address: {
          line1: "1 Test Street",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect(res.status).toBe(400);
  });

  test("400 when nested address contains unknown fields", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "Nested",
        lastName: "Hack",
        email: "nested@test.com",
        phone: "07123456789",
        address: {
          line1: "1 Test Street",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
          injected: "👀",
        },
      });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * CONTENT TYPE / PARSING
   * =========================
   */

  test("415 when Content-Type is not application/json", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Content-Type", "text/plain")
      .send("plain text");

    expect([400, 415]).toContain(res.status);
  });

  test("400 when invalid JSON is sent", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Content-Type", "application/json")
      .send("{ invalid json ");

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("201 creates a new customer (guest checkout)", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "Sarah",
        lastName: "Connor",
        email: "sarah@test.com",
        phone: "07123456789",
        address: {
          line1: "2 Market Street",
          city: "Leeds",
          postcode: "LS1 2AB",
          country: "UK",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const customer = res.body.data.customer;

    expect(customer.email).toBe("sarah@test.com");
    expect(customer.firstName).toBe("Sarah");
    expect(customer.address.city).toBe("Leeds");
  });

  /**
   * =========================
   * DUPLICATES / IDEMPOTENCY
   * =========================
   */

  test("handles duplicate email safely (no crash)", async () => {
    const payload = {
      firstName: "Jane",
      lastName: "Doe",
      email: "duplicate@test.com",
      phone: "07123456789",
      address: {
        line1: "3 Duplicate Road",
        city: "Manchester",
        postcode: "M1 1AA",
        country: "UK",
      },
    };

    const first = await request(app).post("/api/customers").send(payload);
    expect([200, 201]).toContain(first.status);

    const second = await request(app).post("/api/customers").send(payload);
    expect([200, 201, 409]).toContain(second.status);
  });

  test("does not create duplicate address when same email + same address", async () => {
    const payload = {
      firstName: "Address",
      lastName: "Reuse",
      email: "address.reuse@test.com",
      phone: "07123456789",
      address: {
        line1: "17 Seed Street",
        line2: null,
        city: "Bradford",
        postcode: "BD1 1AA",
        country: "UK",
      },
    };

    const first = await request(app).post("/api/customers").send(payload);
    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);
    expect(first.body.data.customer.addresses.length).toBe(1);

    const second = await request(app).post("/api/customers").send(payload);
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.data.customer.addresses.length).toBe(1);
    expect(second.body.data.customer.address.line1).toBe("17 Seed Street");
  });

  test("adds a new address when same email but address fields differ", async () => {
    const base = {
      firstName: "Address",
      lastName: "Add",
      email: "address.add@test.com",
      phone: "07123456789",
      address: {
        line1: "17 Seed Street",
        line2: null,
        city: "Bradford",
        postcode: "BD1 1AA",
        country: "UK",
      },
    };

    const first = await request(app).post("/api/customers").send(base);
    expect(first.status).toBe(201);
    expect(first.body.data.customer.addresses.length).toBe(1);

    const secondPayload = {
      ...base,
      address: {
        ...base.address,
        line1: "18 Seed Street",
      },
    };

    const second = await request(app)
      .post("/api/customers")
      .send(secondPayload);
    expect(second.status).toBe(200);
    expect(second.body.data.customer.addresses.length).toBe(2);
    expect(second.body.data.customer.address.line1).toBe("18 Seed Street");
  });

  /**
   * =========================
   * INJECTION / XSS SAFETY
   * =========================
   */

  test("sanitises script injection attempts", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "<script>alert(1)</script>",
        lastName: "XSS",
        email: "xss@test.com",
        phone: "07123456789",
        address: {
          line1: "<img src=x onerror=alert(1)>",
          city: "Bradford",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect([201, 400]).toContain(res.status);

    if (res.status === 201) {
      expect(res.body.data.customer.firstName).not.toContain("<script>");
    }
  });

  /**
   * =========================
   * METHOD HARDENING
   * =========================
   */

  test("405 for unsupported HTTP methods", async () => {
    const res = await request(app).put("/api/customers");
    expect([404, 405]).toContain(res.status);
  });

  /**
   * =========================
   * PAYLOAD SIZE
   * =========================
   */

  test("413 or 400 for excessively large payload", async () => {
    const bigString = "x".repeat(50_000);

    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: bigString,
        lastName: "Large",
        email: "large@test.com",
        phone: "07123456789",
        address: {
          line1: bigString,
          city: "Big",
          postcode: "BD1 1AA",
          country: "UK",
        },
      });

    expect([400, 413]).toContain(res.status);
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not leak internal fields", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "Secure",
        lastName: "User",
        email: "secure@test.com",
        phone: "07123456789",
        address: {
          line1: "4 Secure Lane",
          city: "York",
          postcode: "YO1 7HP",
          country: "UK",
        },
      });

    const customer = res.body.data.customer;

    expect(customer.__v).toBeUndefined();
    expect(customer.createdBy).toBeUndefined();
    expect(customer.password).toBeUndefined();
  });

  /**
   * =========================
   * EDGE CASES
   * =========================
   */

  test("trims whitespace from fields", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({
        firstName: "  Trim  ",
        lastName: "  Test ",
        email: "  trim@test.com ",
        phone: "07123456789",
        address: {
          line1: " 5 Trim Street ",
          city: " Bradford ",
          postcode: " BD1 1AA ",
          country: " UK ",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.customer.firstName).toBe("Trim");
    expect(res.body.data.customer.email).toBe("trim@test.com");
  });
});
