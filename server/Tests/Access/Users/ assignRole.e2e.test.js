// Tests/Access/Users/assignRoleToUser.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const User = require("../../../models/user.model");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT /api/access/users/:userId/role (E2E)", () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Role.deleteMany({});
  });

  test("401 when not authenticated", async () => {
    const user = await createUser({ role: "staff" });
    const role = await Role.create({
      name: "manager",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/users/${user._id}/role`)
      .send({ roleId: role._id });

    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const admin = await createUser({ role: "admin" });
    const staff = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "manager",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/users/${staff._id}/role`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: role._id });

    expect(res.status).toBe(403);
  });

  test("400 when roleId is invalid", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/access/users/${user._id}/role`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: "not-an-id" });

    expect(res.status).toBe(400);
  });

  test("400 when userId is invalid", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "manager",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put("/api/access/users/not-a-valid-id/role")
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: role._id });

    expect(res.status).toBe(400);
  });

  test("404 when user does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "staff",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put("/api/access/users/64f000000000000000000000/role")
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: role._id });

    expect(res.status).toBe(404);
  });

  test("404 when role does not exist", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const fakeRoleId = "64f000000000000000000001";

    const res = await request(app)
      .put(`/api/access/users/${user._id}/role`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: fakeRoleId });

    expect(res.status).toBe(404);
  });

  test("200 when admin assigns role to user", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "manager",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/users/${user._id}/role`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: role._id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.role.toString()).toBe(role._id.toString());
  });

  test("401 when admin user was deleted after login", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await admin.deleteOne();

    const role = await Role.create({
      name: "manager",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/users/${user._id}/role`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: role._id });

    expect(res.status).toBe(401);
  });
});
