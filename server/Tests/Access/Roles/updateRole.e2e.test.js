// Tests/Access/Roles/updateRole.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const Role = require("../../../models/role.model");
const { createUser } = require("../../helpers/authTestData");
const { loginAs } = require("../../helpers/loginAs");

describe("PUT /api/access/roles/:roleId", () => {
  test("cannot update system role", async () => {
    const admin = await createUser({ role: "admin" });
    const cookies = await loginAs(admin.email);

    const adminRole = await Role.findOne({ name: "admin" });

    const res = await request(app)
      .put(`/api/access/roles/${adminRole._id}`)
      .set("Cookie", cookies)
      .send({ permissions: ["orders.read"] });

    expect(res.status).toBe(400);
  });
});
