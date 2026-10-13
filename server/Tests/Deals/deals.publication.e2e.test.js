require("./helpers/setup");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("./helpers/testApp");
const Deal = require("../../models/deal.model");
const Variant = require("../../models/variant.model");
const admin = require("../../services/deals.admin.service");
const publicService = require("../../services/deals.public.service");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const { createPackage } = require("./helpers/dealFactory");

async function login(role = "admin") {
  const user = await createUser({ role });
  const cookie = getSetCookieHeader(await request(app).post("/api/auth/login").send({ email: user.email, password: "secret123" }));
  return { user, cookie };
}

describe("Deals / draft and publication lifecycle", () => {
  test("an incomplete draft can be saved and edited without becoming discoverable", async () => {
    const { cookie } = await login();
    const created = await request(app).post("/api/admin/deals").set("Cookie", cookie).send({ name: "New draft", publicationStatus: "draft" });
    expect(created.status).toBe(201);
    const deal = created.body.data.deal;
    expect(deal).toMatchObject({ publicationStatus: "draft", items: [], publishedAt: null });
    expect((await request(app).get(`/api/deals/${deal.slug}`)).status).toBe(404);
    expect((await request(app).get("/api/deals")).body.data.deals).toEqual([]);
    expect((await request(app).patch(`/api/admin/deals/${deal._id}`).set("Cookie", cookie).send({ description: "Work in progress" })).status).toBe(200);
    expect((await request(app).post(`/api/admin/deals/${deal._id}/publish`).set("Cookie", cookie)).status).toBe(400);
    expect((await Deal.findById(deal._id)).publicationStatus).toBe("draft");
  });

  test("publishing records the publisher, is idempotent, and unpublishing invalidates basket claims", async () => {
    const { deal, claim, resolvedItems } = await createPackage({ publicationStatus: "draft" });
    const { cookie, user } = await login();
    expect(await publicService.validateDealsForOrder({ dealClaims: [claim], resolvedItems })).toMatchObject({ success: false });
    const published = await request(app).post(`/api/admin/deals/${deal.id}/publish`).set("Cookie", cookie);
    expect(published.status).toBe(200);
    expect(published.body.data.deal).toMatchObject({ publicationStatus: "published", publishedBy: user.id });
    const publishedAt = published.body.data.deal.publishedAt;
    expect((await request(app).get(`/api/deals/${deal.slug}`)).status).toBe(200);
    expect((await request(app).post(`/api/admin/deals/${deal.id}/publish`).set("Cookie", cookie)).body.data.deal.publishedAt).toBe(publishedAt);
    expect((await request(app).post(`/api/admin/deals/${deal.id}/unpublish`).set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).get(`/api/deals/${deal.slug}`)).status).toBe(404);
    expect(await publicService.validateDealsForOrder({ dealClaims: [claim], resolvedItems })).toMatchObject({ success: false });
    expect((await request(app).post(`/api/admin/deals/${deal.id}/unpublish`).set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).post(`/api/admin/deals/${deal.id}/publish`).set("Cookie", cookie)).status).toBe(200);
  });

  test.each(["missing-stock", "reserved-stock", "inactive-variant", "expired", "no-saving"])("publication revalidates %s and leaves the draft unchanged", async reason => {
    const { deal, eggsVariant } = await createPackage({ publicationStatus: "draft" });
    if (reason === "missing-stock") await Variant.updateOne({ _id: eggsVariant.id }, { stockQuantity: 0 });
    if (reason === "reserved-stock") await Variant.updateOne({ _id: eggsVariant.id }, { reservedQuantity: 9 });
    if (reason === "inactive-variant") await Variant.updateOne({ _id: eggsVariant.id }, { status: "inactive" });
    if (reason === "expired") await Deal.updateOne({ _id: deal.id }, { endsAt: new Date(Date.now() - 1000) });
    if (reason === "no-saving") await Deal.updateOne({ _id: deal.id }, { packagePrice: 20 });
    expect(await admin.publishDeal({ dealId: deal.id })).toMatchObject({ success: false, statusCode: 400 });
    expect((await Deal.findById(deal.id)).publicationStatus).toBe("draft");
  });

  test("publication accepts a future schedule but keeps it private until the start", async () => {
    const { deal } = await createPackage({ publicationStatus: "draft", startsAt: new Date(Date.now() + 60000) });
    expect((await admin.publishDeal({ dealId: deal.id })).success).toBe(true);
    expect(await publicService.getActiveDealBySlug({ slug: deal.slug })).toMatchObject({ success: false, statusCode: 404 });
  });

  test("activation cannot bypass draft privacy and archive remains terminal", async () => {
    const { deal } = await createPackage({ publicationStatus: "draft", isActive: false });
    expect((await admin.updateDeal({ dealId: deal.id, body: { isActive: true } })).success).toBe(true);
    expect((await publicService.listActiveDeals()).data.deals).toEqual([]);
    await admin.archiveDeal({ dealId: deal.id });
    expect(await admin.publishDeal({ dealId: deal.id })).toMatchObject({ success: false, statusCode: 409 });
    expect(await admin.unpublishDeal({ dealId: deal.id })).toMatchObject({ success: false, statusCode: 409 });
  });

  test.each(["publish", "unpublish"])("%s rejects unauthenticated and unprivileged users", async action => {
    const { deal } = await createPackage();
    expect((await request(app).post(`/api/admin/deals/${deal.id}/${action}`)).status).toBe(401);
    const { cookie } = await login("staff");
    expect((await request(app).post(`/api/admin/deals/${deal.id}/${action}`).set("Cookie", cookie)).status).toBe(403);
  });

  test("draft status cannot be bypassed by patching the publication field", async () => {
    const { deal } = await createPackage({ publicationStatus: "draft" });
    const { cookie } = await login();
    expect((await request(app).patch(`/api/admin/deals/${deal.id}`).set("Cookie", cookie).send({ publicationStatus: "published" })).status).toBe(400);
  });

  test("legacy records without publication or pricing fields remain available", async () => {
    const { deal, claim, resolvedItems } = await createPackage();
    await Deal.collection.updateOne({ _id: deal._id }, { $unset: { publicationStatus: "", pricingMode: "", publishedAt: "" } });
    expect((await publicService.getActiveDealBySlug({ slug: deal.slug })).success).toBe(true);
    expect((await publicService.validateDealsForOrder({ dealClaims: [claim], resolvedItems })).success).toBe(true);
    expect((await admin.getDeal({ dealId: deal.id })).data.deal.publicationStatus).toBe("published");
  });

  test("status filtering combines publication privacy and regex-safe search", async () => {
    await createPackage({ publicationStatus: "draft", name: "Milk (draft)" });
    await createPackage({ publicationStatus: "published", name: "Milk (live)" });
    expect((await admin.listDeals({ status: "draft" })).meta.total).toBe(1);
    expect((await admin.listDeals({ status: "published", search: "(live)" })).meta.total).toBe(1);
    expect((await admin.listDeals({ status: "active", search: "(draft)" })).meta.total).toBe(0);
  });

  test.each([admin.publishDeal, admin.unpublishDeal])("missing deal returns 404", async mutate => {
    expect(await mutate({ dealId: new mongoose.Types.ObjectId().toString() })).toMatchObject({ success: false, statusCode: 404 });
  });
});
