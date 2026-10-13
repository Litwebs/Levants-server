require("./helpers/setup");
const request = require("supertest");
const app = require("./helpers/testApp");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const Deal = require("../../models/deal.model");
const admin = require("../../services/deals.admin.service");
const stripe = require("../../utils/stripe.util");
const { createBasketFixture, expectedQuantities } = require("../../IntegrationTests/Deals/basketFixtures.cjs");

const address = { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" };

function basket(f, manual = {}, packages = {}, explicit = {}) {
  const quantities = expectedQuantities(f, manual, explicit);
  return {
    customerId: f.customer.id,
    items: Object.entries(quantities).map(([variantId, quantity]) => ({ variantId, quantity })),
    deals: Object.entries(packages).map(([key, quantity]) => ({
      dealId: f.deals[key].id, quantity,
      expectedPackagePrice: key === "A" ? 8 : 6,
    })),
    deliveryAddress: address,
  };
}

async function checkout(body) { return request(app).post("/api/orders").send(body); }

test.each([
  ["one milk stays retail", { Milk: 1 }, {}, 5],
  ["two milk form A", { Milk: 2 }, { A: 1 }, 8],
  ["three milk leave one retail", { Milk: 3 }, { A: 1 }, 13],
  ["four milk form two A", { Milk: 4 }, { A: 2 }, 16],
  ["milk and honey form B", { Milk: 1, Honey: 1 }, { B: 1 }, 6],
  ["two milk and honey leave one retail", { Milk: 2, Honey: 1 }, { B: 1 }, 11],
  ["two milk and two honey form two B", { Milk: 2, Honey: 2 }, { B: 2 }, 12],
  ["three milk and honey form A and B", { Milk: 3, Honey: 1 }, { A: 1, B: 1 }, 14],
  ["wrong milk variant stays retail", { Milk: 1, OtherMilk: 1 }, {}, 10],
  ["incomplete mixed deal stays retail", { Honey: 1 }, {}, 4],
  ["explicit A only", {}, { A: 1 }, 8, { A: 1 }],
  ["explicit A plus automatic A", { Milk: 2 }, { A: 2 }, 16, { A: 1 }],
  ["explicit A plus automatic B", { Milk: 1, Honey: 1 }, { A: 1, B: 1 }, 14, { A: 1 }],
  ["explicit A plus retail honey", { Honey: 1 }, { A: 1 }, 12, { A: 1 }],
  ["two explicit packages", {}, { A: 1, B: 1 }, 14, { A: 1, B: 1 }],
  ["extra unrelated product stays retail", { Juice: 1 }, { A: 1 }, 11, { A: 1 }],
])("admin configured basket: %s", async (_name, manual, packages, expectedSubtotal, explicit = {}) => {
  const f = await createBasketFixture();
  const body = basket(f, manual, packages, explicit);
  const response = await checkout(body);
  expect(response.status).toBe(200);
  const order = await Order.findById(response.body.data.orderId).lean();
  expect(order.subtotal - order.discountAmount).toBeCloseTo(expectedSubtotal, 2);
  expect(order.total).toBeCloseTo(expectedSubtotal + order.deliveryFee, 2);
  expect(Object.fromEntries(order.items.map(item => [String(item.variant), item.quantity]))).toEqual(expectedQuantities(f, manual, explicit));
  expect(Object.fromEntries((order.metadata?.deals || []).map(deal => [String(deal.dealId), deal.quantity]))).toEqual(
    Object.fromEntries(Object.entries(packages).map(([key, quantity]) => [f.deals[key].id, quantity])),
  );
  for (const [variantId, quantity] of Object.entries(expectedQuantities(f, manual, explicit))) {
    expect((await Variant.findById(variantId)).reservedQuantity).toBe(quantity);
  }
});

test("admin price edit rejects a stale claim and accepts the reviewed price", async () => {
  const f = await createBasketFixture();
  const changed = await admin.updateDeal({ dealId: f.deals.A.id, body: { packagePrice: 7 } });
  expect(changed.success).toBe(true);
  const body = basket(f, { Milk: 2 }, { A: 1 });
  expect((await checkout(body)).status).toBe(400);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Variant.findById(f.variants.Milk.id)).reservedQuantity).toBe(0);
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  body.deals[0].expectedPackagePrice = 7;
  expect((await checkout(body)).status).toBe(200);
});

test.each([
  ["inactive", { isActive: false }],
  ["expired", { endsAt: new Date(Date.now() - 1000) }],
  ["archived", { archivedAt: new Date(), isActive: false }],
])("admin %s offer cannot be checked out from an old basket", async (_name, update) => {
  const f = await createBasketFixture();
  await Deal.updateOne({ _id: f.deals.A.id }, { $set: update });
  expect((await checkout(basket(f, { Milk: 2 }, { A: 1 }))).status).toBeGreaterThanOrEqual(400);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Variant.findById(f.variants.Milk.id)).reservedQuantity).toBe(0);
});

test("a package cannot reuse the milk already allocated to another package", async () => {
  const f = await createBasketFixture();
  const body = basket(f, {}, { A: 1, B: 1 }, { A: 1, B: 1 });
  body.items.find(item => item.variantId === f.variants.Milk.id).quantity = 2;
  expect((await checkout(body)).status).toBeGreaterThanOrEqual(400);
  expect(await Order.countDocuments()).toBe(0);
});

test("stock is checked again at checkout across explicit and manual quantities", async () => {
  const f = await createBasketFixture();
  await Variant.updateOne({ _id: f.variants.Milk.id }, { stockQuantity: 3 });
  expect((await checkout(basket(f, { Milk: 2 }, { A: 2 }, { A: 1 }))).status).toBeGreaterThanOrEqual(400);
  expect(await Order.countDocuments()).toBe(0);
  expect((await Variant.findById(f.variants.Milk.id)).reservedQuantity).toBe(0);
});
