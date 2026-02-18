const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT /api/auth/users/:userId (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when request is not authenticated", async () => {
    const res = await request(app)
      .put("/api/auth/users/64f000000000000000000000")
      .send({ name: "Test" });

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION (RBAC)
   * =========================
   */

  test("403 when authenticated but not admin", async () => {
    const staff = await createUser({ role: "staff" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Hacked" });

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when userId is invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/users/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Test" });

    expect(res.status).toBe(400);
  });

  test("400 when password is too short", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ password: "123" });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * RESOURCE EXISTENCE
   * =========================
   */

  test("404 when target user does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/users/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Test" });

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * BUSINESS RULES
   * =========================
   */

  test("400 when admin attempts to update themselves via admin route", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${admin._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "New Admin Name" });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * SUCCESS PATHS
   * =========================
   */

  test("200 admin can update user name", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.name).toBe("Updated Name");
  });

  test("200 admin can reset user password and new password works", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ password: "oldpass123" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ password: "NewPassword123" });

    expect(res.status).toBe(200);

    // verify old password no longer works
    const oldLogin = await request(app).post("/api/auth/login").send({
      email: target.email,
      password: "oldpass123",
    });

    expect(oldLogin.status).toBe(401);

    // verify new password works
    const newLogin = await request(app).post("/api/auth/login").send({
      email: target.email,
      password: "NewPassword123",
    });

    expect(newLogin.status).toBe(200);
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not leak sensitive fields in response", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Safe Update" });

    const user = res.body.data.user;

    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorLogin).toBeUndefined();
  });

  /**
   * =========================
   * PREFERENCES / NOTIFICATIONS
   * =========================
   */

  test("200 admin can update a single notification preference", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            deliveryUpdates: true,
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.preferences.notifications.deliveryUpdates).toBe(
      true,
    );
  });

  test("200 admin can update multiple notification preferences", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            newOrders: false,
            lowStockAlerts: false,
            paymentReceived: true,
          },
        },
      });

    expect(res.status).toBe(200);

    const notifications = res.body.data.user.preferences.notifications;
    expect(notifications.newOrders).toBe(false);
    expect(notifications.lowStockAlerts).toBe(false);
    expect(notifications.paymentReceived).toBe(true);
  });

  test("partial notification update does not overwrite other notification settings", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    // First update
    await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            newOrders: false,
          },
        },
      });

    // Second update (different field)
    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            deliveryUpdates: true,
          },
        },
      });

    const notifications = res.body.data.user.preferences.notifications;

    expect(notifications.newOrders).toBe(false); // preserved
    expect(notifications.deliveryUpdates).toBe(true);
  });

  test("400 when unknown notification key is provided", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            hackerFlag: true,
          },
        },
      });

    expect(res.status).toBe(400);
  });

  test("400 when notification value is not boolean", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            newOrders: "yes",
          },
        },
      });

    expect(res.status).toBe(400);
  });

  test("400 when preferences contains forbidden fields", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          notifications: {
            newOrders: true,
          },
          role: "admin",
        },
      });

    expect(res.status).toBe(400);
  });
});
