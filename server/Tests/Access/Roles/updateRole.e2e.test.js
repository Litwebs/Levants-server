// Tests/Access/Roles/updateRole.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const { createUser } = require("../../helpers/authTestData");
const { loginAs } = require("../../helpers/loginAs");

describe("PUT /api/access/roles/:roleId (E2E)", () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  test("401 when not authenticated", async () => {
    const role = await Role.create({
      name: "editor",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .send({ permissions: ["orders.write"] });

    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });
    const cookies = await loginAs(user.email);

    const role = await Role.create({
      name: "editor",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.write"] });

    expect(res.status).toBe(403);
  });

  test("400 for invalid roleId format", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .put("/api/access/roles/not-a-valid-id")
      .set("Cookie", cookies)
      .send({ permissions: ["orders.write"] });

    expect(res.status).toBe(400);
  });

  test("404 when role does not exist", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const fakeId = "64b1f9b9f9b9f9b9f9b9f9b9";

    const res = await request(app)
      .put(`/api/access/roles/${fakeId}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.read"] });

    expect(res.status).toBe(404);
  });

  test("400 when trying to update system role", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const adminRole = await Role.findOne({ name: "admin" });
    await Role.updateOne({ _id: adminRole._id }, { isSystem: true });

    const res = await request(app)
      .put(`/api/access/roles/${adminRole._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.read"] });

    expect(res.status).toBe(400);
  });

  test("400 when payload is empty", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const role = await Role.create({
      name: "editor",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({});

    expect(res.status).toBe(400);
  });

  test("200 when admin updates permissions only", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const role = await Role.create({
      name: "editor",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.read", "orders.update"] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role.permissions).toEqual([
      "orders.read",
      "orders.update",
    ]);
  });

  test("200 when admin updates description only", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const role = await Role.create({
      name: "editor",
      permissions: ["orders.read"],
      description: "Old description",
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({ description: "New description" });

    expect(res.status).toBe(200);
    expect(res.body.data.role.description).toBe("New description");
  });

  test("updates are persisted in database", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const role = await Role.create({
      name: "auditor",
      permissions: ["orders.read"],
    });

    await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.read", "products.read"] });

    const updated = await Role.findById(role._id);
    expect(updated.permissions).toEqual(["orders.read", "products.read"]);
  });

  test("401 when admin user was deleted after login", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    await admin.deleteOne();

    const role = await Role.create({
      name: "ghost-test",
      permissions: ["orders.read"],
    });

    const res = await request(app)
      .put(`/api/access/roles/${role._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.write"] });

    expect(res.status).toBe(401);
  });
});
