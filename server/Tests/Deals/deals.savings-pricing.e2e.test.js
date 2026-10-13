require("./helpers/setup");
const request = require("supertest");
const app = require("./helpers/testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const admin = require("../../services/deals.admin.service");
const publicService = require("../../services/deals.public.service");
const { createCustomer } = require("../Orders/helpers/orderFactory");
const { createPackage } = require("./helpers/dealFactory");
const address = { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" };

async function checkout(fixture, price) {
  const customer = await createCustomer();
  return request(app).post("/api/orders").send({ customerId: customer.id, items: fixture.contents, deals: [{ ...fixture.claim, expectedPackagePrice: price }], deliveryAddress: address });
}

describe("Deals / savings modes through preview and checkout", () => {
  test.each([["fixed_saving", 3, 11.75], ["percentage_saving", 20, 11.8]])("%s agrees across admin, public and Stripe checkout", async (pricingMode, savingValue, price) => {
    const fixture = await createPackage({ pricingMode, savingValue });
    expect((await admin.getDeal({ dealId: fixture.deal.id })).data.deal.packagePrice).toBe(price);
    expect((await publicService.getActiveDealBySlug({ slug: fixture.deal.slug })).data.deal.packagePrice).toBe(price);
    const response = await checkout(fixture, price);
    expect(response.status).toBe(200);
    const order = await Order.findById(response.body.data.orderId).lean();
    expect(order.total).toBe(price + 1);
    expect(order.metadata.deals[0]).toMatchObject({ pricingMode, savingValue, packagePrice: price });
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: Math.round((14.75 - price) * 100) }));
  });

  test.each([["fixed_saving", 3, 13.25], ["percentage_saving", 20, 13]])("%s recomputes after a retail change and rejects a stale basket", async (pricingMode, savingValue, changedPrice) => {
    const fixture = await createPackage({ pricingMode, savingValue });
    const originalPrice = (await publicService.getActiveDealBySlug({ slug: fixture.deal.slug })).data.deal.packagePrice;
    fixture.milkVariant.price = 4; await fixture.milkVariant.save();
    expect((await publicService.getActiveDealBySlug({ slug: fixture.deal.slug })).data.deal.packagePrice).toBe(changedPrice);
    const stale = await checkout(fixture, originalPrice);
    expect(stale.status).toBe(400);
    expect(stale.body.message).toMatch(/price has changed/i);
    expect((await Variant.findById(fixture.milkVariant.id)).reservedQuantity).toBe(0);
    expect((await checkout(fixture, changedPrice)).status).toBe(200);
  });

  test("a draft can select savings mode without a package price, then publish", async () => {
    const fixture = await createPackage();
    const result = await admin.createDeal({ body: { name: "Percentage draft", publicationStatus: "draft", items: fixture.contents, pricingMode: "percentage_saving", savingValue: 25 } });
    expect(result.success).toBe(true);
    expect(result.data.deal.packagePrice).toBe(11.06);
    expect((await admin.publishDeal({ dealId: String(result.data.deal._id) })).success).toBe(true);
  });

  test("mode changes persist their definition and clear a saving when returning to fixed price", async () => {
    const fixture = await createPackage();
    const changed = await admin.updateDeal({ dealId: fixture.deal.id, body: { pricingMode: "fixed_saving", savingValue: 2 } });
    expect(changed.data.deal).toMatchObject({ pricingMode: "fixed_saving", savingValue: 2, packagePrice: 12.75 });
    const fixed = await admin.updateDeal({ dealId: fixture.deal.id, body: { pricingMode: "fixed_price", packagePrice: 10 } });
    expect(fixed.data.deal).toMatchObject({ pricingMode: "fixed_price", savingValue: null, packagePrice: 10 });
  });

  test("invalid savings on a published deal are rejected without changing it", async () => {
    const fixture = await createPackage();
    expect(await admin.updateDeal({ dealId: fixture.deal.id, body: { pricingMode: "percentage_saving", savingValue: 100 } })).toMatchObject({ success: false, statusCode: 400 });
    expect((await Deal.findById(fixture.deal.id)).pricingMode).toBe("fixed_price");
  });

  test("fixed saving exceeding live retail value hides the offer and rejects checkout", async () => {
    const fixture = await createPackage({ pricingMode: "fixed_saving", savingValue: 3 });
    await Variant.updateMany({ _id: { $in: [fixture.milkVariant.id, fixture.eggsVariant.id] } }, { price: 0.25 });
    expect(await publicService.getActiveDealBySlug({ slug: fixture.deal.slug })).toMatchObject({ success: false, statusCode: 404 });
    expect((await checkout(fixture, 11.75)).status).toBe(400);
  });
});
