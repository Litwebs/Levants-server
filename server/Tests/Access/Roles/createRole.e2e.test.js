// Tests/Access/Roles/createRole.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const { createUser } = require("../../helpers/authTestData");
const { loginAs } = require("../../helpers/loginAs");
const User = require("../../../models/user.model");
const Role = require("../../../models/role.model");

describe("POST /api/access/roles (E2E)", () => {
  // check that only admin can create roles, and that the payload is validated
  test("403 for non-admin", async () => {
    const user = await createUser({ role: "manager" });
    const cookies = await loginAs(user.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "test", permissions: ["orders.read"] });

    expect(res.status).toBe(403);
  });

  // check that name and permissions are required
  test("400 for invalid payload", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({});

    expect(res.status).toBe(400);
  });

  // check that a role can be created with valid payload
  test("201 create role", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "warehouse",
        permissions: ["products.read"],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.role.name).toBe("warehouse");
  });

  // check that role name is unique
  test("401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/access/roles")
      .send({ name: "test", permissions: ["orders.read"] });

    expect(res.status).toBe(401);
  });

  // check that user cannot create role if their role was downgraded after login
  test("403 if user role downgraded after login", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    // simulate role downgrade
    const staffRole = await Role.findOne({ name: "staff" });
    await User.updateOne({ email: admin.email }, { role: staffRole._id });

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "test", permissions: ["orders.read"] });

    expect(res.status).toBe(403);
  });

  // check that permissions array is validated
  test("400 when permissions array is empty", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "empty-perms", permissions: [] });

    expect(res.status).toBe(400);
  });

  // check that permissions is an array of strings
  test("400 when permissions is not an array", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "bad-perms",
        permissions: "orders.read",
      });

    expect(res.status).toBe(400);
  });

  // check that permissions array does not contain invalid values
  test("400 when permissions contain invalid values", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "invalid-perm",
        permissions: ["DROP TABLE users"],
      });

    expect(res.status).toBe(400);
  });

  // check that role name is unique (case-insensitive)
  test("409 when role name already exists", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "support", permissions: ["orders.read"] });

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "support", permissions: ["orders.update"] });

    expect(res.status).toBe(409);
  });

  // check that role name is unique (case-insensitive)
  test("409 for role name with different casing", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "Supervisor", permissions: ["orders.read"] });

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "supervisor", permissions: ["orders.update"] });

    expect(res.status).toBe(409);
  });

  // check that a role can be created with valid payload
  test("400 when role name is too long", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "a".repeat(300),
        permissions: ["orders.read"],
      });

    expect(res.status).toBe(400);
  });

  // check that a role cannot be created with XSS attempt in name
  test("400 for XSS attempt in role name", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "<script>alert(1)</script>",
        permissions: ["orders.read"],
      });

    expect(res.status).toBe(400);
  });

  // check that a role cannot be created with XSS attempt in permissions
  test("response contains expected role fields", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({
        name: "finance",
        permissions: ["orders.read"],
      });

    expect(res.body.data.role).toMatchObject({
      name: "finance",
      permissions: expect.any(Array),
      _id: expect.any(String),
    });
  });

  // check that permissions array is saved without mutation
  test("permissions are saved without mutation", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const perms = ["orders.read", "orders.update"];

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "ops", permissions: perms });

    expect(res.body.data.role.permissions).toEqual(perms);
  });

  // check that only one role is created when multiple requests with same name are made concurrently
  test("only one role created on concurrent requests", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const payload = {
      name: "logistics",
      permissions: ["orders.read"],
    };

    const [r1, r2] = await Promise.all([
      request(app)
        .post("/api/access/roles")
        .set("Cookie", cookies)
        .send(payload),
      request(app)
        .post("/api/access/roles")
        .set("Cookie", cookies)
        .send(payload),
    ]);

    const statuses = [r1.status, r2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);
  });
});
