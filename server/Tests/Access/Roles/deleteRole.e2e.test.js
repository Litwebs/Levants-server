const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("DELETE /api/access/roles/:roleId (E2E)", () => {
  test("401 when not authenticated", async () => {
    const role = await Role.create({
      name: "temp",
      permissions: ["orders.read"],
    });

    const res = await request(app).delete(`/api/access/roles/${role._id}`);
    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });
    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "temp2",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("400 when trying to delete system role", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const adminRole = await Role.findOne({ name: "admin" });

    const res = await request(app)
      .delete(`/api/access/roles/${adminRole._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  test("400 when role is assigned to users", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "assigned-role",
      permissions: ["orders.read"],
    });

    await createUser({ role: "assigned-role" });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  test("200 when admin deletes unassigned non-system role", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "delete-me",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
