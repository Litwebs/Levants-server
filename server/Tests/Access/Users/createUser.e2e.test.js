const request = require("supertest");

const app = require("../../testApp");
const Role = require("../../../models/role.model");
const User = require("../../../models/user.model");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("POST /api/auth/users (E2E)", () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Role.deleteMany({});
  });

  test("creates drivers with all notification preferences disabled", async () => {
    const admin = await createUser({ role: "admin", status: "active" });
    const driverRole = await Role.create({
      name: "driver",
      permissions: ["delivery.read"],
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/auth/users")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        name: "New Driver",
        email: "new-driver@example.com",
        password: "secret123",
        roleId: driverRole._id.toString(),
        status: "active",
      });

    expect(res.status).toBe(200);

    const notifications = res.body.data.user.preferences.notifications;
    expect(notifications.newOrders).toBe(false);
    expect(notifications.orderUpdates).toBe(false);
    expect(notifications.lowStockAlerts).toBe(false);
    expect(notifications.outOfStock).toBe(false);
    expect(notifications.deliveryUpdates).toBe(false);
    expect(notifications.customerMessages).toBe(false);
    expect(notifications.paymentReceived).toBe(false);
  });
});