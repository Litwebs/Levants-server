"use strict";

const request = require("supertest");
const app = require("../testApp");
const Customer = require("../../models/customer.model");
const { createPortalCustomer, loginPortalCustomer } = require("./helpers");

describe("Portal Auth", () => {
  describe("POST /api/portal/auth/register", () => {
    it("registers a new customer", async () => {
      const email = `reg-${Date.now()}@test.com`;
      const res = await request(app).post("/api/portal/auth/register").send({
        firstName: "Jane",
        lastName: "Doe",
        email,
        password: "TestPass1",
        confirmPassword: "TestPass1",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const saved = await Customer.findOne({ email });
      expect(saved).not.toBeNull();
      expect(saved.isGuest).toBe(false);
      // Never store plain text passwords
      expect(saved.passwordHash).not.toBe("TestPass1");
    });

    it("rejects duplicate email for registered account", async () => {
      const { email } = await createPortalCustomer();

      const res = await request(app).post("/api/portal/auth/register").send({
        firstName: "Jane",
        lastName: "Doe",
        email,
        password: "TestPass1",
        confirmPassword: "TestPass1",
      });

      expect(res.status).toBe(409);
    });

    it("rejects mismatched passwords", async () => {
      const res = await request(app)
        .post("/api/portal/auth/register")
        .send({
          firstName: "Jane",
          lastName: "Doe",
          email: `mismatch-${Date.now()}@test.com`,
          password: "TestPass1",
          confirmPassword: "WrongPass1",
        });

      expect(res.status).toBe(400);
    });

    it("rejects weak password", async () => {
      const res = await request(app)
        .post("/api/portal/auth/register")
        .send({
          firstName: "Jane",
          lastName: "Doe",
          email: `weak-${Date.now()}@test.com`,
          password: "weak",
          confirmPassword: "weak",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/portal/auth/login", () => {
    it("logs in with correct credentials", async () => {
      const creds = await createPortalCustomer();
      const res = await request(app)
        .post("/api/portal/auth/login")
        .send({ email: creds.email, password: creds.password });

      expect(res.status).toBe(200);
      expect(res.body.data.customer.email).toBe(creds.email);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it("rejects incorrect password", async () => {
      const creds = await createPortalCustomer();
      const res = await request(app)
        .post("/api/portal/auth/login")
        .send({ email: creds.email, password: "WrongPass1" });

      expect(res.status).toBe(401);
    });

    it("rejects guest customers (no portal account)", async () => {
      const guest = await Customer.create({
        firstName: "Guest",
        lastName: "User",
        email: `guest-${Date.now()}@test.com`,
        isGuest: true,
        status: "active",
      });

      const res = await request(app)
        .post("/api/portal/auth/login")
        .send({ email: guest.email, password: "anything" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/portal/auth/me", () => {
    it("returns profile for authenticated customer", async () => {
      const creds = await createPortalCustomer();
      const { accessToken } = await loginPortalCustomer(creds);

      const res = await request(app)
        .get("/api/portal/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customer.email).toBe(creds.email);
      expect(res.body.data.customer.passwordHash).toBeUndefined();
    });

    it("rejects unauthenticated request", async () => {
      const res = await request(app).get("/api/portal/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/portal/auth/me", () => {
    it("updates customer profile", async () => {
      const creds = await createPortalCustomer();
      const { accessToken } = await loginPortalCustomer(creds);

      const res = await request(app)
        .patch("/api/portal/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ firstName: "Updated" });

      expect(res.status).toBe(200);
      expect(res.body.data.customer.firstName).toBe("Updated");
    });
  });
});
