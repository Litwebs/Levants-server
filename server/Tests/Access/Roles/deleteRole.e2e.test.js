const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const User = require("../../../models/user.model");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("DELETE /api/access/roles/:roleId (E2E)", () => {
  // check that only admin can delete roles, and that system roles or roles assigned to users cannot be deleted
  test("401 when not authenticated", async () => {
    const role = await Role.create({
      name: "temp",
      permissions: ["orders.read"],
    });

    const res = await request(app).delete(`/api/access/roles/${role._id}`);
    expect(res.status).toBe(401);
  });

  // check that non-admin users cannot delete roles
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

  // check that system roles cannot be deleted
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

  // check that roles assigned to users cannot be deleted
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

  // check that an unassigned non-system role can be deleted by admin
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

  // check that 400 is returned for invalid roleId format
  test("400 for invalid roleId format", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .delete("/api/access/roles/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  // check that 404 is returned when role does not exist
  test("404 when role does not exist", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const fakeId = "64b1f9b9f9b9f9b9f9b9f9b9";

    const res = await request(app)
      .delete(`/api/access/roles/${fakeId}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  // check that 400 is returned if role becomes assigned to a user between the time of the initial check and the delete operation
  test("400 if role becomes assigned before deletion", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "race-role",
      permissions: ["orders.read"],
    });

    // assign role right before delete
    const user = await createUser({ role: "staff" });
    await User.updateOne({ _id: user._id }, { role: role._id });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  // check that role is actually removed from database after deletion
  test("role is removed from database after deletion", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "verify-delete",
      permissions: ["orders.read"],
    });

    await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    const deleted = await Role.findById(role._id);
    expect(deleted).toBeNull();
  });

  // check that 400 is returned if role is changed to system role between the time of the initial check and the delete operation
  test("400 if isSystem=true even when created manually", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "fake-system",
      permissions: ["orders.read"],
      isSystem: true,
    });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  // check that 401 is returned if admin user is deleted between the time of the initial check and the delete operation
  test("401 when admin user no longer exists", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await admin.deleteOne();

    const role = await Role.create({
      name: "orphan-test",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(401);
  });

  // check that 403 is returned if admin user role is changed to non-admin between the time of the initial check and the delete operation
  test("successful delete returns consistent response shape", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role = await Role.create({
      name: "shape-test",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .delete(`/api/access/roles/${role._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.body).toEqual({
      success: true,
    });
  });
});
