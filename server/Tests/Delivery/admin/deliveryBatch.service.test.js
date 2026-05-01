const mongoose = require("mongoose");

jest.mock("../../../Integration/google.geocode", () => ({
  geocodeAddress: jest.fn(async (addr) => ({
    lat: 51.5,
    lng: -0.1,
    formattedAddress: `${addr.line1}, ${addr.postcode}`,
  })),
}));

jest.mock("../../../Integration/Email.service", () => {
  const fn = jest.fn(async () => ({ success: true, response: { id: "e1" } }));
  fn.sendBatchEmails = jest.fn(async () => ({ results: [] }));
  return fn;
});

const DeliveryBatch = require("../../../models/deliveryBatch.model");
const Order = require("../../../models/order.model");

const batchService = require("../../../services/delivery/delivery.batch.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../../Orders/helpers/orderFactory");

function futureDateStr(offsetDays = 5) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

describe("createDeliveryBatch", () => {
  test("returns error when deliveryDate is missing", async () => {
    const res = await batchService.createDeliveryBatch({});
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/deliveryDate/i);
  });

  test("returns error when deliveryDate is invalid", async () => {
    const res = await batchService.createDeliveryBatch({
      deliveryDate: "not-a-date",
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/invalid/i);
  });

  test("returns error when startTime format is wrong", async () => {
    const res = await batchService.createDeliveryBatch({
      deliveryDate: futureDateStr(10),
      deliveryWindowStart: "9am",
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/HH:mm/);
  });

  test("returns error when endTime format is wrong", async () => {
    const res = await batchService.createDeliveryBatch({
      deliveryDate: futureDateStr(11),
      deliveryWindowEnd: "5pm",
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/HH:mm/);
  });

  test("returns error when no eligible orders exist for the date", async () => {
    const res = await batchService.createDeliveryBatch({
      deliveryDate: futureDateStr(30),
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/no eligible orders/i);
  });

  test("returns error when duplicate batch for the same date", async () => {
    const dateStr = futureDateStr(40);
    const date = new Date(dateStr);
    await DeliveryBatch.create({
      deliveryDate: date,
      status: "locked",
      orders: [],
      lockedAt: new Date(),
    });

    const res = await batchService.createDeliveryBatch({
      deliveryDate: dateStr,
    });

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/already exists/i);
  });

  test("creates a batch from eligible orders for the date", async () => {
    const dateStr = futureDateStr(60);
    const deliveryDate = new Date(dateStr);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      overrides: {
        paidAt: new Date(),
        deliveryDate,
      },
    });

    const res = await batchService.createDeliveryBatch({
      deliveryDate: dateStr,
    });

    expect(res.success).toBe(true);
    expect(res.data.batchId).toBeDefined();
    expect(res.data.totalOrders).toBe(1);
  });

  test("respects optional delivery window times when valid", async () => {
    const dateStr = futureDateStr(70);
    const deliveryDate = new Date(dateStr);

    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
      overrides: {
        paidAt: new Date(),
        deliveryDate,
      },
    });

    const res = await batchService.createDeliveryBatch({
      deliveryDate: dateStr,
      deliveryWindowStart: "09:00",
      deliveryWindowEnd: "17:00",
    });

    expect(res.success).toBe(true);
    const batch = await DeliveryBatch.findById(res.data.batchId).lean();
    expect(batch.deliveryWindowStart).toBe("09:00");
    expect(batch.deliveryWindowEnd).toBe("17:00");
  });

  test("returns error when orderIds contain invalid MongoDB IDs", async () => {
    const res = await batchService.createDeliveryBatch({
      deliveryDate: futureDateStr(80),
      orderIds: ["not-an-id", "also-bad"],
    });

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/valid IDs/i);
  });

  test("returns error when valid orderIds are not eligible (wrong date or status)", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const order = await createOrder({
      status: "pending",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: variant.price,
        },
      ],
    });

    const res = await batchService.createDeliveryBatch({
      deliveryDate: futureDateStr(90),
      orderIds: [String(order._id)],
    });

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not eligible/i);
  });
});

describe("listBatches", () => {
  test("returns batches array (possibly empty)", async () => {
    const res = await batchService.listBatches({});
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data.batches)).toBe(true);
  });

  test("filters by status when provided", async () => {
    // Create one completed batch
    const dateStr = futureDateStr(100);
    await DeliveryBatch.create({
      deliveryDate: new Date(dateStr),
      status: "completed",
      orders: [],
      lockedAt: new Date(),
    });

    const res = await batchService.listBatches({ status: "completed" });
    expect(res.success).toBe(true);
    for (const batch of res.data.batches) {
      expect(batch.status).toBe("completed");
    }
    expect(res.data.batches.length).toBeGreaterThanOrEqual(1);
  });
});
