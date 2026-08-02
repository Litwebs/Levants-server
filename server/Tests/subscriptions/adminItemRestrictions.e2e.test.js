const request = require("supertest");
const app = require("../testApp");

const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("Admin subscription item restrictions (E2E)", () => {
  const subscriptionId = "64f000000000000000000001";
  const itemId = "64f000000000000000000002";

  async function loginAdmin() {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    return getSetCookieHeader(login);
  }

  test.each([
    ["post", `/api/admin/subscriptions/${subscriptionId}/items`, { variantId: itemId, quantity: 1 }],
    ["patch", `/api/admin/subscriptions/${subscriptionId}/items/${itemId}`, { quantity: 2 }],
    ["delete", `/api/admin/subscriptions/${subscriptionId}/items/${itemId}`, undefined],
  ])("403 blocks admin %s item mutations", async (method, path, body) => {
    const cookie = await loginAdmin();
    let call = request(app)[method](path).set("Cookie", cookie);
    if (body) call = call.send(body);

    const res = await call;

    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      "Subscription products cannot be changed by admins",
    );
  });

  test.each(["pause", "resume"])(
    "status endpoint %s remains available to admins",
    async (action) => {
      const cookie = await loginAdmin();
      const res = await request(app)
        .post(`/api/admin/subscriptions/${subscriptionId}/${action}`)
        .set("Cookie", cookie);

      // A non-existent ID reaches the status controller and service. This
      // confirms the endpoint remains available rather than being denied.
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Subscription not found");
    },
  );
});
