const request = require("supertest");
const app = require("../testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const jwt = require("../../utils/jwt.util");
const { RefundOrder, applyStripeRefundSucceeded } = require("../../services/orders/orders.refund.service");
const { finalizeStockForOrder } = require("../../services/orders/orders.stock.service");
const { HandlePaymentExpired, HandlePaymentFailed, HandlePaymentSuccess } = require("../../services/orders/orders.webhook.service");
const { ExpirePendingOrders } = require("../../services/orders/orders.cron.service");
const { createCustomer } = require("../Orders/helpers/orderFactory");
const { createPackage } = require("./helpers/dealFactory");
const address = { line1: "1 Test Street", city: "Bradford", postcode: "BD1 1AA", country: "GB" };

async function pendingPackage({ mixed = false, credit = 0 } = {}) {
  const fixture = await createPackage();
  const customer = await createCustomer();
  let response;
  const payload = { items: mixed ? [{ variantId: fixture.milkVariant.id, quantity: 3 }, fixture.contents[1]] : fixture.contents,
    deals: [fixture.claim], deliveryAddress: address };
  if (credit) {
    customer.isGuest = false; customer.status = "active"; customer.creditBalance = 500; await customer.save();
    response = await request(app).post("/api/portal/orders/checkout").set("Authorization", `Bearer ${jwt.signCustomerAccessToken(customer)}`).send({ ...payload, creditToApplyMinor: credit });
  } else response = await request(app).post("/api/orders").send({ ...payload, customerId: customer.id });
  expect(response.status).toBe(200);
  return { ...fixture, customer, order: await Order.findById(response.body.data.orderId) };
}

async function paidPackage(options) {
  const fixture = await pendingPackage(options);
  await finalizeStockForOrder(fixture.order.id, { stripePaymentIntentId: `pi_${fixture.order.id}` });
  fixture.order = await Order.findById(fixture.order.id);
  return fixture;
}

describe("Deals / refunds and payment recovery", () => {
  test("full refund uses the discounted total including delivery, and restocks actual components only once", async () => {
    const fixture = await paidPackage();
    expect(fixture.order.total).toBe(12.5);
    const result = await RefundOrder({ orderId: fixture.order.id, restock: true });
    expect(result.success).toBe(true);
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1250 }), expect.anything());
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(20);
    expect((await Variant.findById(fixture.eggsVariant.id)).stockQuantity).toBe(9);
    await applyStripeRefundSucceeded({ paymentIntentId: fixture.order.stripePaymentIntentId, stripeRefundId: result.data.refundId, amountMinor: 1250, currency: "gbp", orderId: fixture.order.id });
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(20);
    expect((await Order.findById(fixture.order.id)).refunds).toHaveLength(1);
  });

  test("partial refunds respect the discounted remaining amount without restocking", async () => {
    const fixture = await paidPackage();
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_part_deal", amount: 300, status: "succeeded" });
    expect((await RefundOrder({ orderId: fixture.order.id, amount: 3 })).success).toBe(true);
    expect((await Order.findById(fixture.order.id)).status).toBe("partially_refunded");
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(18);
    expect(await RefundOrder({ orderId: fixture.order.id, amount: 10 })).toMatchObject({ success: false, statusCode: 400 });
    expect(await RefundOrder({ orderId: fixture.order.id, amount: 2, restock: true })).toMatchObject({ success: false, statusCode: 400 });
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_remaining_deal", amount: 950, status: "succeeded" });
    expect((await RefundOrder({ orderId: fixture.order.id, restock: true })).success).toBe(true);
    expect((await Order.findById(fixture.order.id)).status).toBe("refunded");
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(20);
  });

  test("mixed deal and normal quantities refund only the charged order total", async () => {
    const fixture = await paidPackage({ mixed: true });
    expect(fixture.order.total).toBe(15.75);
    expect((await RefundOrder({ orderId: fixture.order.id })).success).toBe(true);
    expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1575 }), expect.anything());
  });

  test("later deal edits and archival do not rewrite historical prices, contents or refund limits", async () => {
    const fixture = await paidPackage();
    const snapshot = JSON.parse(JSON.stringify(fixture.order.metadata.deals));
    await Deal.updateOne({ _id: fixture.deal.id }, { name: "New package", packagePrice: 6, archivedAt: new Date(), items: [{ variant: fixture.milkVariant.id, quantity: 1 }] });
    const saved = await Order.findById(fixture.order.id);
    expect(JSON.parse(JSON.stringify(saved.metadata.deals))).toEqual(snapshot);
    expect(saved.items.map(item => item.quantity)).toEqual([2, 3]);
    expect(await RefundOrder({ orderId: saved.id, amount: 14.75 })).toMatchObject({ success: false, statusCode: 400 });
  });

  test.each([HandlePaymentExpired, HandlePaymentFailed])("unsuccessful credit-assisted checkout releases components without spending credit", async handler => {
    const fixture = await pendingPackage({ credit: 200 });
    await handler({ metadata: { orderId: fixture.order.id } });
    expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(500);
    for (const variant of [fixture.milkVariant, fixture.eggsVariant]) expect((await Variant.findById(variant.id)).reservedQuantity).toBe(0);
    expect((await Order.findById(fixture.order.id)).metadata.deals[0].packagePrice).toBe(11.5);
  });

  test("expiration recovery cancels an unpaid package and releases every component", async () => {
    const fixture = await pendingPackage();
    await Order.updateOne({ _id: fixture.order.id }, { reservationExpiresAt: new Date(Date.now() - 1000) });
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({ id: fixture.order.stripeCheckoutSessionId, status: "expired", payment_status: "unpaid", metadata: { orderId: fixture.order.id } });
    await ExpirePendingOrders();
    expect((await Order.findById(fixture.order.id)).status).toBe("cancelled");
    for (const variant of [fixture.milkVariant, fixture.eggsVariant]) expect((await Variant.findById(variant.id)).reservedQuantity).toBe(0);
  });

  test("replayed successful payment does not consume package stock or credit twice", async () => {
    const fixture = await pendingPackage({ credit: 200 });
    const session = { id: fixture.order.stripeCheckoutSessionId, payment_intent: `pi_${fixture.order.id}`, metadata: { orderId: fixture.order.id }, currency: "gbp", amount_subtotal: 1575, amount_total: 1050, total_details: { amount_discount: 525 } };
    await HandlePaymentSuccess(session);
    await HandlePaymentSuccess(session);
    expect((await Customer.findById(fixture.customer.id)).creditBalance).toBe(300);
    expect((await Variant.findById(fixture.milkVariant.id)).stockQuantity).toBe(18);
    expect((await Variant.findById(fixture.eggsVariant.id)).stockQuantity).toBe(6);
    expect((await Order.findById(fixture.order.id)).total).toBe(12.5);
  });
});
