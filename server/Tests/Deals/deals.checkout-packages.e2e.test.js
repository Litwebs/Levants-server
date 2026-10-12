const request = require("supertest");
const app = require("../testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const { validateDealsForOrder } = require("../../services/deals.public.service");
const { finalizeStockForOrder, releaseReservedStock } = require("../../services/orders/orders.stock.service");
const { createCustomer } = require("../Orders/helpers/orderFactory");
const { createPackage } = require("./helpers/dealFactory");
const address = { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" };

async function checkout(fixture, changes = {}) {
  const customer = await createCustomer();
  return request(app).post("/api/orders").send({ customerId: customer.id,
    items: fixture.contents, deals: [fixture.claim], deliveryAddress: address, ...changes });
}

describe("Deals / mixed package checkout and fulfilment", () => {
  test("checkout records real product quantities, package savings and Stripe totals", async () => {
    const fixture = await createPackage();
    const response = await checkout(fixture);
    expect(response.status).toBe(200);
    const order = await Order.findById(response.body.data.orderId).lean();
    expect(order).toMatchObject({ subtotal: 14.75, discountAmount: 3.25, deliveryFee: 1, total: 12.5 });
    expect(order.items.map(item => [String(item.variant), item.quantity])).toEqual(fixture.contents.map(item => [item.variantId, item.quantity]));
    expect(order.metadata.deals[0]).toMatchObject({ dealId: fixture.deal.id, packagePrice: 11.5, originalValue: 14.75, saving: 3.25 });
    const session = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(session.line_items.slice(0, 2).map(item => [item.price_data.unit_amount, item.quantity])).toEqual([[325, 2], [275, 3]]);
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 325 }));
    expect((await Variant.findById(fixture.milkVariant.id)).reservedQuantity).toBe(2);
    expect((await Variant.findById(fixture.eggsVariant.id)).reservedQuantity).toBe(3);
  });

  test("two offers sharing a variant require the sum of their component quantities", async () => {
    const fixture = await createPackage();
    const second = await Deal.create({ name: "Extra milk", slug: "extra-milk", items: [{ variant: fixture.milkVariant.id, quantity: 1 }], packagePrice: 2 });
    const claims = [fixture.claim, { dealId: second.id, quantity: 1, expectedPackagePrice: 2 }];
    expect(await validateDealsForOrder({ dealClaims: claims, resolvedItems: fixture.resolvedItems })).toMatchObject({ success: false, message: "Deal contents do not match the order" });
    const response = await checkout(fixture, { deals: claims, items: [{ variantId: fixture.milkVariant.id, quantity: 3 }, fixture.contents[1]] });
    expect(response.status).toBe(200);
    expect(await Order.findById(response.body.data.orderId).lean()).toMatchObject({ subtotal: 18, discountAmount: 4.5, total: 14.5 });
  });

  test("retail price increases preserve package price and adjust only its saving", async () => {
    const fixture = await createPackage();
    fixture.milkVariant.price = 4;
    await fixture.milkVariant.save();
    const response = await checkout(fixture);
    expect(response.status).toBe(200);
    expect(await Order.findById(response.body.data.orderId).lean()).toMatchObject({ subtotal: 16.25, discountAmount: 4.75, total: 12.5 });
  });

  test("retail value dropping below package price rejects checkout and rolls back every component", async () => {
    const fixture = await createPackage();
    fixture.milkVariant.price = 1;
    await fixture.milkVariant.save();
    const response = await checkout(fixture);
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/price is no longer valid/i);
    expect(await Order.countDocuments()).toBe(0);
    for (const variant of [fixture.milkVariant, fixture.eggsVariant]) expect((await Variant.findById(variant.id)).reservedQuantity).toBe(0);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  test("content fingerprint is independent of component ordering", async () => {
    const fixture = await createPackage();
    const result = await validateDealsForOrder({ dealClaims: [{ ...fixture.claim, expectedContents: [...fixture.contents].reverse() }], resolvedItems: fixture.resolvedItems });
    expect(result).toMatchObject({ success: true, data: { discountAmount: 3.25 } });
  });

  test("Stripe session failure rolls back order creation and all stock reservations", async () => {
    const fixture = await createPackage();
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error("Stripe unavailable"));
    const response = await checkout(fixture);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await Order.countDocuments()).toBe(0);
    for (const variant of [fixture.milkVariant, fixture.eggsVariant]) expect((await Variant.findById(variant.id)).reservedQuantity).toBe(0);
  });

  test("settlement consumes only the underlying components once and preserves the original deal snapshot", async () => {
    const fixture = await createPackage();
    const response = await checkout(fixture);
    const id = response.body.data.orderId;
    await Deal.updateOne({ _id: fixture.deal.id }, { $set: { name: "Changed later", packagePrice: 10, archivedAt: new Date(), isActive: false } });
    await finalizeStockForOrder(id, { stripePaymentIntentId: "pi_package_test" });
    await expect(finalizeStockForOrder(id)).rejects.toThrow(/already processed/i);
    expect(await Order.findById(id).lean()).toMatchObject({ status: "paid", total: 12.5, metadata: { deals: [expect.objectContaining({ name: "Breakfast package", packagePrice: 11.5 })] } });
    expect(await Variant.findById(fixture.milkVariant.id).lean()).toMatchObject({ stockQuantity: 18, reservedQuantity: 0 });
    expect(await Variant.findById(fixture.eggsVariant.id).lean()).toMatchObject({ stockQuantity: 6, reservedQuantity: 0 });
  });

  test.each(["cancelled", "failed"])("%s payment releases every component without consuming stock", async status => {
    const fixture = await createPackage();
    const response = await checkout(fixture);
    await releaseReservedStock(response.body.data.orderId, status);
    expect((await Order.findById(response.body.data.orderId)).status).toBe(status);
    expect(await Variant.findById(fixture.milkVariant.id).lean()).toMatchObject({ stockQuantity: 20, reservedQuantity: 0 });
    expect(await Variant.findById(fixture.eggsVariant.id).lean()).toMatchObject({ stockQuantity: 9, reservedQuantity: 0 });
  });
});
