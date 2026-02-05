// Tests/Access/Roles/createRole.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const { createUser } = require("../../helpers/authTestData");
const { loginAs } = require("../../helpers/loginAs");

describe("POST /api/access/roles (E2E)", () => {
  test("403 for non-admin", async () => {
    const user = await createUser({ role: "manager" });
    const cookies = await loginAs(user.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({ name: "test", permissions: ["orders.read"] });

    expect(res.status).toBe(403);
  });

  test("400 for invalid payload", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const res = await request(app)
      .post("/api/access/roles")
      .set("Cookie", cookies)
      .send({});

    expect(res.status).toBe(400);
  });

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
});
