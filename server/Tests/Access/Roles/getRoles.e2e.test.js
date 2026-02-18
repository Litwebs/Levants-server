// Tests/Access/Roles/getRoles.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/access/roles (E2E)", () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  test("401 when not authenticated", async () => {
    const res = await request(app).get("/api/access/roles");
    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });
    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 when admin and returns roles array", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await Role.create([
      { name: "role-a", permissions: ["orders.read"] },
      { name: "role-b", permissions: ["orders.write"] },
    ]);

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.roles)).toBe(true);
    expect(res.body.data.roles.length).toBeGreaterThanOrEqual(2);
  });

  test("roles are sorted by createdAt ascending", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const role1 = await Role.create({
      name: "first",
      permissions: ["orders.read"],
    });

    const role2 = await Role.create({
      name: "second",
      permissions: ["orders.write"],
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    const roles = res.body.data.roles;

    const role1Index = roles.findIndex(
      (r) => r._id.toString() === role1._id.toString(),
    );
    const role2Index = roles.findIndex(
      (r) => r._id.toString() === role2._id.toString(),
    );

    expect(role1Index).toBeGreaterThan(-1);
    expect(role2Index).toBeGreaterThan(-1);
    expect(role1Index).toBeLessThan(role2Index);
  });

  test("response role object contains expected fields", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await Role.create({
      name: "inspector",
      permissions: ["orders.read"],
      description: "Inspection role",
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    const role = res.body.data.roles[0];

    expect(role).toMatchObject({
      name: expect.any(String),
      permissions: expect.any(Array),
      isSystem: expect.any(Boolean),
    });

    expect(role._id).toBeDefined();
    expect(role.createdAt).toBeDefined();
  });

  test("200 when authenticated", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.roles)).toBe(true);
  });

  test("401 when admin user was deleted after login", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await admin.deleteOne();

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(401);
  });
});
