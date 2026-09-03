const request = require("supertest");

const app = require("../../testApp");

const ProductVariant = require("../../../models/variant.model");
const Subscription = require("../../../models/subscription.model");
const SubscriptionDelivery = require("../../../models/subscriptionDelivery.model");

const { loginAsAdmin } = require("../../helpers/loginAs");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

describe("POST /api/admin/delivery/orders/stock (E2E)", () => {
  test("aggregates stock from provided orderIds", async () => {
    const adminCookie = await loginAsAdmin(app);

    const customer = await createCustomer();

    const product = await createProduct();
    const variant = await createVariant({
      product,
      overrides: { sku: "SKU-A" },
    });

    const item1 = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 2,
      subtotal: variant.price * 2,
    };

    const item2 = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 3,
      subtotal: variant.price * 3,
    };

    const order1 = await createOrder({
      status: "paid",
      customer,
      items: [item1],
      overrides: { paidAt: new Date() },
    });

    const order2 = await createOrder({
      status: "paid",
      customer,
      items: [item2],
      overrides: { paidAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/admin/delivery/orders/stock`)
      .set("Cookie", adminCookie)
      .send({ orderIds: [String(order1._id), String(order2._id)] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body?.data?.items || [];
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe(variant.sku);
    expect(items[0].totalQuantity).toBe(5);
  });

  test("aggregates stock from uploaded csv ordersFile", async () => {
    const adminCookie = await loginAsAdmin(app);

    const product = await createProduct();
    const variant = await createVariant({
      product,
      overrides: { sku: "SKU-CSV" },
    });

    // Ensure variant is active (some factories may create inactive variants)
    await ProductVariant.updateOne(
      { _id: variant._id },
      { $set: { status: "active" } },
    );

    const sku = String(variant.sku);
    const csv = `name,order\nAlice,2x ${sku}\nBob,${sku}\n`;

    const res = await request(app)
      .post(`/api/admin/delivery/orders/stock`)
      .set("Cookie", adminCookie)
      .attach("ordersFile", Buffer.from(csv, "utf8"), "orders.csv");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const items = res.body?.data?.items || [];
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe(sku);
    expect(items[0].totalQuantity).toBe(3);

    const sources = res.body?.data?.sources;
    expect(sources?.sheet?.detectedType).toBe("csv");
  });

  test("selects the full delivery day and includes subscription add-ons without double counting", async () => {
    const adminCookie = await loginAsAdmin(app);
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 2.5 });
    const deliveryDate = new Date("2026-09-06T09:00:00.000Z");
    const londonStartOfDeliveryDay = new Date("2026-09-05T23:30:00.000Z");

    const makeOrderItem = (quantity, isSubscriptionAddOn = false) => ({
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity,
      subtotal: variant.price * quantity,
      isSubscriptionAddOn,
    });

    await createOrder({
      status: "paid",
      customer,
      items: [makeOrderItem(2)],
      overrides: { deliveryDate, orderType: "one_time" },
    });
    await createOrder({
      status: "cancelled",
      customer,
      items: [makeOrderItem(99)],
      overrides: { deliveryDate, orderType: "one_time" },
    });

    const scheduledSubscription = await Subscription.create({
      subscriptionNumber: "SUB-STOCK-SCHEDULED",
      customer: customer._id,
      status: "active",
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
      nextDeliveryDate: deliveryDate,
      startDate: new Date("2026-08-01T09:00:00.000Z"),
      deliveryAddress: {
        line1: "10 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          quantity: 50,
        },
      ],
      deliveryDayPlans: [
        {
          day: 0,
          items: [
            {
              product: product._id,
              variant: variant._id,
              name: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: 3,
            },
          ],
        },
      ],
    });

    await SubscriptionDelivery.create({
      subscription: scheduledSubscription._id,
      customer: customer._id,
      scheduledDate: londonStartOfDeliveryDay,
      status: "scheduled",
      addOns: [
        {
          operationId: "stock-addon-scheduled",
          amountMinor: 1000,
          stripePaymentIntentId: "pi_stock_addon_scheduled",
          paidAt: new Date("2026-09-01T10:00:00.000Z"),
          items: [
            {
              product: product._id,
              variant: variant._id,
              name: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: 4,
              subtotal: variant.price * 4,
            },
          ],
        },
      ],
    });

    const generatedSubscription = await Subscription.create({
      subscriptionNumber: "SUB-STOCK-GENERATED",
      customer: customer._id,
      status: "active",
      frequency: "weekly",
      preferredDeliveryDay: 0,
      preferredDeliveryDays: [0],
      nextDeliveryDate: deliveryDate,
      startDate: new Date("2026-08-01T09:00:00.000Z"),
      deliveryAddress: {
        line1: "10 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      },
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          quantity: 1,
        },
      ],
    });
    const generatedOrder = await createOrder({
      status: "paid",
      customer,
      items: [makeOrderItem(1), makeOrderItem(2, true)],
      overrides: {
        deliveryDate,
        orderType: "subscription_generated",
        subscription: generatedSubscription._id,
      },
    });
    await SubscriptionDelivery.create({
      subscription: generatedSubscription._id,
      customer: customer._id,
      scheduledDate: deliveryDate,
      status: "generated",
      order: generatedOrder._id,
      addOns: [
        {
          operationId: "stock-addon-generated",
          amountMinor: 500,
          stripePaymentIntentId: "pi_stock_addon_generated",
          paidAt: new Date("2026-09-01T11:00:00.000Z"),
          items: [
            {
              product: product._id,
              variant: variant._id,
              name: variant.name,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: 2,
              subtotal: variant.price * 2,
            },
          ],
        },
      ],
    });

    const getStock = (orderTypeScope) =>
      request(app)
        .post("/api/admin/delivery/orders/stock")
        .set("Cookie", adminCookie)
        .send({ deliveryDate: "2026-09-06", orderTypeScope });

    const both = await getStock("both");
    expect(both.status).toBe(200);
    expect(both.body.data.items).toHaveLength(1);
    expect(both.body.data.items[0].totalQuantity).toBe(12);
    expect(both.body.data.sources).toMatchObject({
      deliveryDate: "2026-09-06",
      ordersFound: 2,
      scheduledSubscriptionDeliveriesFound: 1,
    });

    const oneTimeOnly = await getStock("normal");
    expect(oneTimeOnly.status).toBe(200);
    expect(oneTimeOnly.body.data.items[0].totalQuantity).toBe(2);

    const subscriptionsOnly = await getStock("subscription");
    expect(subscriptionsOnly.status).toBe(200);
    expect(subscriptionsOnly.body.data.items[0].totalQuantity).toBe(10);
  });

  test("rejects an invalid delivery date", async () => {
    const adminCookie = await loginAsAdmin(app);

    const res = await request(app)
      .post("/api/admin/delivery/orders/stock")
      .set("Cookie", adminCookie)
      .send({ deliveryDate: "2026-02-31" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid date/i);
  });
});
