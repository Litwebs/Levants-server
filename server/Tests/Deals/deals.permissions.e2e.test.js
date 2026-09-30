const request = require("supertest");

const app = require("../testApp");
const Role = require("../../models/role.model");
const { createUser } = require("../helpers/authTestData");
const { loginAs } = require("../helpers/loginAs");

describe("admin Deals permissions", () => {
  test("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/admin/deals");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("rejects authenticated users without promotions.read", async () => {
    const role = await Role.create({
      name: `deals_none_${Date.now()}`,
      permissions: ["products.read"],
      isSystem: false,
    });
    const user = await createUser({
      role: role.name,
      status: "active",
      password: "secret123",
    });
    user.role = role._id;
    await user.save();
    const cookie = await loginAs(app, user);

    const res = await request(app)
      .get("/api/admin/deals")
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("allows promotions.read but still blocks create without promotions.create", async () => {
    const role = await Role.create({
      name: `deals_reader_${Date.now()}`,
      permissions: ["promotions.read"],
      isSystem: false,
    });
    const user = await createUser({
      role: role.name,
      status: "active",
      password: "secret123",
    });
    user.role = role._id;
    await user.save();
    const cookie = await loginAs(app, user);

    const list = await request(app)
      .get("/api/admin/deals")
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);

    const create = await request(app)
      .post("/api/admin/deals")
      .set("Cookie", cookie)
      .send({});
    expect(create.status).toBe(403);
    expect(create.body.success).toBe(false);
  });
  test("archive requires promotions.delete", async () => {
    const role = await Role.create({
      name: `deals_editor_${Date.now()}`,
      permissions: ["promotions.read", "promotions.update"],
      isSystem: false,
    });
    const user = await createUser({ role: role.name, status: "active", password: "secret123" });
    user.role = role._id;
    await user.save();
    const cookie = await loginAs(app, user);
    const fakeId = new (require("mongoose").Types.ObjectId)();

    const res = await request(app)
      .post(`/api/admin/deals/${fakeId}/archive`)
      .set("Cookie", cookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

});
