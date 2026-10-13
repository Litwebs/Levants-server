require("./helpers/setup");
const request = require("supertest");
const app = require("./helpers/testApp");
const Deal = require("../../models/deal.model");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const { createPackage } = require("./helpers/dealFactory");

let cookie;
beforeEach(async () => {
  const user = await createUser({ role: "admin" });
  cookie = getSetCookieHeader(await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" }));
});

describe("Deals / API update validation", () => {
  test.each([
    ["empty patch", {}], ["unknown field", { published: true }],
    ["short name", { name: "x" }], ["long name", { name: "x".repeat(141) }],
    ["invalid slug", { slug: "invalid slug" }], ["empty contents", { items: [] }],
    ["zero quantity", { items: [{ variantId: "507f1f77bcf86cd799439011", quantity: 0 }] }],
    ["fractional quantity", { items: [{ variantId: "507f1f77bcf86cd799439011", quantity: 1.5 }] }],
    ["too many units", { items: [{ variantId: "507f1f77bcf86cd799439011", quantity: 1000 }] }],
    ["non-positive price", { packagePrice: 0 }], ["unsupported currency", { currency: "EUR" }],
    ["invalid date", { startsAt: "tomorrow" }], ["negative ordering", { sortOrder: -1 }],
    ["external image URL", { image: "https://example.com/image.png" }],
  ])("%s is rejected without modifying the saved deal", async (_, body) => {
    const { deal } = await createPackage();
    const before = await Deal.findById(deal.id).lean();
    const response = await request(app).patch(`/api/admin/deals/${deal.id}`).set("Cookie", cookie).send(body);
    expect(response.status).toBe(400);
    expect(await Deal.findById(deal.id).lean()).toEqual(before);
  });

  test("malformed route IDs return validation errors for all mutations", async () => {
    for (const [method, suffix] of [["patch", ""], ["delete", ""], ["post", "/archive"]]) {
      expect((await request(app)[method](`/api/admin/deals/invalid${suffix}`).set("Cookie", cookie).send({ name: "Updated" })).status).toBe(400);
    }
  });
});
