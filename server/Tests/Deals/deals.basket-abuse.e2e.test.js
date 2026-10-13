require("./helpers/setup");
jest.mock("../../Integration/emailTransport", () => ({ createEmailTransport: () => ({ emails: { send: jest.fn(async () => ({ data: { id: "test-email" } })) } }) }));
const request = require("supertest");
const app = require("./helpers/testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const Product = require("../../models/product.model");
const stripe = require("../../utils/stripe.util");
const jwt = require("../../utils/jwt.util");
const { createBasketFixture } = require("../../IntegrationTests/Deals/basketFixtures.cjs");

function payload(f) {
  return { items: [{ variantId: f.variants.Milk.id, quantity: 2 }],
    deals: [{ dealId: f.deals.A.id, quantity: 1, expectedPackagePrice: 8, expectedContents: [{ variantId: f.variants.Milk.id, quantity: 2 }] }],
    deliveryAddress: { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" } };
}
function post(f, body, authenticated) {
  if (authenticated) return request(app).post("/api/portal/orders/checkout").set("Cookie", `customerAccessToken=${jwt.signCustomerAccessToken(f.customer)}`).send(body);
  return request(app).post("/api/orders").send({ customerId: f.customer.id, ...body });
}
async function assertRejected(f, response) {
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await Order.countDocuments()).toBe(0);
  for (const variant of Object.values(f.variants)) {
    expect((await Variant.findById(variant.id))?.reservedQuantity || 0).toBe(0);
  }
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
}

for (const authenticated of [false, true]) describe(`${authenticated ? "Account" : "Guest"} basket abuse protection`, () => {
  test.each([
    ["forged package price", (b) => { b.deals[0].expectedPackagePrice = 0.01; }],
    ["overclaimed package quantity", (b) => { b.deals[0].quantity = 2; }],
    ["duplicate package claims", (b) => { b.deals.push({ ...b.deals[0] }); }],
    ["tampered component fingerprint", (b) => { b.deals[0].expectedContents[0].quantity = 1; }],
    ["wrong variant", (b, f) => { b.items[0].variantId = f.variants.OtherMilk.id; }],
    ["mixed package missing honey", (b, f) => { b.deals = [{ dealId: f.deals.B.id, quantity: 1, expectedPackagePrice: 6 }]; }],
    ["overlapping claims using one bottle twice", (b, f) => { b.items.push({ variantId: f.variants.Honey.id, quantity: 1 }); b.deals.push({ dealId: f.deals.B.id, quantity: 1, expectedPackagePrice: 6 }); }],
    ["negative item quantity", (b) => { b.items[0].quantity = -2; }],
    ["fractional item quantity", (b) => { b.items[0].quantity = 1.5; }],
    ["zero package quantity", (b) => { b.deals[0].quantity = 0; }],
    ["fractional package quantity", (b) => { b.deals[0].quantity = 0.5; }],
    ["package quantity above limit", (b) => { b.deals[0].quantity = 100; }],
    ["forged final total", (b) => { b.total = 0.01; }],
    ["forged discount amount", (b) => { b.discountAmount = 1000; }],
    ["discount code stacked with package savings", (b) => { b.discountCode = "EXTRA10"; }],
  ])("rejects %s and rolls back reservations", async (name, change) => {
    const f = await createBasketFixture();
    const body = payload(f);
    change(body, f);
    await assertRejected(f, await post(f, body, authenticated));
  });

  test.each(["expired", "future", "inactive", "archived", "variant-inactive", "product-inactive", "price-invalid"])("rejects %s offer even when the client submits an old valid claim", async reason => {
    const f = await createBasketFixture();
    if (reason === "variant-inactive") await Variant.updateOne({ _id: f.variants.Milk.id }, { status: "inactive" });
    else if (reason === "product-inactive") await Product.updateOne({ _id: f.products.Milk.id }, { status: "draft" });
    else if (reason === "price-invalid") await Variant.updateOne({ _id: f.variants.Milk.id }, { price: 3 });
    else await Deal.updateOne({ _id: f.deals.A.id }, {
      expired: { endsAt: new Date(Date.now() - 1000) },
      future: { startsAt: new Date(Date.now() + 86400000) },
      inactive: { isActive: false },
      archived: { archivedAt: new Date(), isActive: false },
    }[reason]);
    await assertRejected(f, await post(f, payload(f), authenticated));
  });
});

test("guest checkout cannot spend account credit", async () => {
  const f = await createBasketFixture({ credit: 10000 });
  await assertRejected(f, await post(f, { ...payload(f), creditToApplyMinor: 900 }, false));
  expect((await Customer.findById(f.customer.id)).creditBalance).toBe(10000);
});

test("account checkout cannot select another customer's credit balance", async () => {
  const f = await createBasketFixture({ credit: 10000 });
  await assertRejected(f, await post(f, { ...payload(f), customerId: "507f1f77bcf86cd799439011", creditToApplyMinor: 900 }, true));
  expect((await Customer.findById(f.customer.id)).creditBalance).toBe(10000);
});

test("concurrent customers cannot reserve the same final package twice", async () => {
  const f = await createBasketFixture();
  await Variant.updateOne({ _id: f.variants.Milk.id }, { stockQuantity: 2 });
  const responses = await Promise.all([post(f, payload(f), false), post(f, payload(f), false)]);
  expect(responses.filter(response => response.status === 200)).toHaveLength(1);
  expect(responses.filter(response => response.status >= 400)).toHaveLength(1);
  expect(await Order.countDocuments()).toBe(1);
  expect((await Variant.findById(f.variants.Milk.id)).reservedQuantity).toBe(2);
  expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
});
