const request = require("supertest");
const app = require("../testApp");

const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("Business Info API (E2E)", () => {
  /**
   * =========================
   * GET /api/business-info
   * =========================
   */

  describe("GET /api/business-info", () => {
    // check that only users with business.info.read permission can access, and that it returns the business info
    test("401 when not authenticated", async () => {
      const res = await request(app).get("/api/business-info");
      expect(res.status).toBe(401);
    });

    // check that users without business.info.read permission cannot access
    test("403 when authenticated but lacking business.info.read permission", async () => {
      const staff = await createUser({ role: "staff" });

      const login = await request(app).post("/api/auth/login").send({
        email: staff.email,
        password: "secret123",
      });

      const res = await request(app)
        .get("/api/business-info")
        .set("Cookie", getSetCookieHeader(login));

      expect(res.status).toBe(403);
    });

    // check that users with business.info.read permission can access and it returns the business info
    test("200 when user has business.info.read permission", async () => {
      const admin = await createUser({ role: "admin" });

      const login = await request(app).post("/api/auth/login").send({
        email: admin.email,
        password: "secret123",
      });

      const res = await request(app)
        .get("/api/business-info")
        .set("Cookie", getSetCookieHeader(login));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.business).toBeDefined();
      expect(res.body.data.business.companyName).toBeDefined();
    });
  });

  /**
   * =========================
   * PUT /api/business-info
   * =========================
   */

  describe("PUT /api/business-info", () => {
    test("401 when not authenticated", async () => {
      const res = await request(app)
        .put("/api/business-info")
        .send({ companyName: "New Name" });

      expect(res.status).toBe(401);
    });

    // check that users without business.info.update permission cannot access
    test("403 when authenticated but lacking business.info.update permission", async () => {
      const staff = await createUser({ role: "staff" });

      const login = await request(app).post("/api/auth/login").send({
        email: staff.email,
        password: "secret123",
      });

      const res = await request(app)
        .put("/api/business-info")
        .set("Cookie", getSetCookieHeader(login))
        .send({ companyName: "Hacked Name" });

      expect(res.status).toBe(403);
    });

    // check that payload with unknown fields is rejected
    test("400 when payload contains unknown fields", async () => {
      const admin = await createUser({ role: "admin" });

      const login = await request(app).post("/api/auth/login").send({
        email: admin.email,
        password: "secret123",
      });

      const res = await request(app)
        .put("/api/business-info")
        .set("Cookie", getSetCookieHeader(login))
        .send({
          companyName: "Valid Name",
          role: "admin", // ❌ forbidden field
        });

      expect(res.status).toBe(400);
    });

    // check that invalid email is rejected
    test("400 when email is invalid", async () => {
      const admin = await createUser({ role: "admin" });

      const login = await request(app).post("/api/auth/login").send({
        email: admin.email,
        password: "secret123",
      });

      const res = await request(app)
        .put("/api/business-info")
        .set("Cookie", getSetCookieHeader(login))
        .send({
          email: "not-an-email",
        });

      expect(res.status).toBe(400);
    });

    // check that valid update by admin succeeds
    test("200 admin can update business info (partial update)", async () => {
      const admin = await createUser({ role: "admin" });

      const login = await request(app).post("/api/auth/login").send({
        email: admin.email,
        password: "secret123",
      });

      const res = await request(app)
        .put("/api/business-info")
        .set("Cookie", getSetCookieHeader(login))
        .send({
          companyName: "Updated Business Name",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.business.companyName).toBe("Updated Business Name");
    });

    // check that admin can update multiple fields at once
    test("200 admin can update multiple fields", async () => {
      const admin = await createUser({ role: "admin" });

      const login = await request(app).post("/api/auth/login").send({
        email: admin.email,
        password: "secret123",
      });

      const payload = {
        companyName: "Levants Dairy Farm Ltd",
        email: "contact@levantsdairy.com",
        phone: "+44 7911 123456",
        address: "45 Green Lane, Somerset, UK",
      };

      const res = await request(app)
        .put("/api/business-info")
        .set("Cookie", getSetCookieHeader(login))
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.business.companyName).toBe(payload.companyName);
      expect(res.body.data.business.email).toBe(payload.email);
      expect(res.body.data.business.phone).toBe(payload.phone);
      expect(res.body.data.business.address).toBe(payload.address);
    });
  });
});
