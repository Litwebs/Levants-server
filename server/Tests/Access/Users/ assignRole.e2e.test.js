const request = require("supertest");
const app = require("../../testApp");

const Role = require("../../../models/role.model");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

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

test("404 when user does not exist", async () => {
  const admin = await createUser({ role: "admin" });

  const login = await request(app).post("/api/auth/login").send({
    email: admin.email,
    password: "secret123",
  });

  const role = await Role.findOne({ name: "staff" });

  const res = await request(app)
    .put(`/api/access/users/64f000000000000000000000/role`)
    .set("Cookie", getSetCookieHeader(login))
    .send({ roleId: role._id });

  expect(res.status).toBe(400);
});
