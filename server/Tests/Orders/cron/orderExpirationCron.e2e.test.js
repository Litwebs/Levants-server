// Tests/Orders/cron/orderExpirationCron.e2e.test.js
const mongoose = require("mongoose");

const Order = require("../../../models/order.model");
const Product = require("../../../models/product.model");
const Variant = require("../../../models/variant.model");
const File = require("../../../models/file.model");

const {
  runOrderExpirationJob,
} = require("../../../scripts/orderExpiration.scheduler");

describe("ORDER EXPIRATION CRON (E2E)", () => {
  let product;
  let variant;
  let variant2;

  const getValidDeliveryAddress = () => ({
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    postcode: "SW1A 2AA",
    country: "United Kingdom",
  });

  const getValidLocation = () => ({
    lat: 51.5033635,
    lng: -0.1276248,
  });

  async function createTestFile() {
    return File.create({
      originalName: "cron.jpg",
      filename: `cron-${Date.now()}`,
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      url: "https://cdn.test.com/cron.jpg",
      uploadedBy: new mongoose.Types.ObjectId(),
    });
  }

  function installTransactionNoops() {
    // Global test setup runs `jest.restoreAllMocks()` after each test.
    // This suite needs the transaction/session no-ops for every test.

    // 1) no-op session/transactions
    jest.spyOn(mongoose, "startSession").mockImplementation(async () => ({
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    }));

    // 2) Make Order.find(...).session(session) ignore session
    const originalFind = Order.find.bind(Order);
    jest.spyOn(Order, "find").mockImplementation((filter) => {
      return {
        session: () => originalFind(filter),
      };
    });

    // 3) Strip session option for variant update
    const originalFindByIdAndUpdate = Variant.findByIdAndUpdate.bind(Variant);
    jest
      .spyOn(Variant, "findByIdAndUpdate")
      .mockImplementation((id, update, opts) => {
        const safeOpts = { ...(opts || {}) };
        delete safeOpts.session;
        return originalFindByIdAndUpdate(id, update, safeOpts);
      });

    // 4) Strip session option for order.save
    const originalSave = Order.prototype.save;
    jest.spyOn(Order.prototype, "save").mockImplementation(function (opts) {
      const safeOpts = { ...(opts || {}) };
      delete safeOpts.session;
      return originalSave.call(this, safeOpts);
    });
  }

  beforeEach(async () => {
    installTransactionNoops();

    const file = await createTestFile();

    product = await Product.create({
      name: "Cron Product",
      slug: `cron-product-${Date.now()}`,
      description: "Cron test product",
      category: "test",
      status: "active",
      thumbnailImage: file._id,
    });

    variant = await Variant.create({
      product: product._id,
      name: "Cron Variant",
      sku: `CRON-SKU-${Date.now()}`,
      price: 10,
      stockQuantity: 10,
      reservedQuantity: 0,
      status: "active",
      thumbnailImage: file._id,
    });

    variant2 = await Variant.create({
      product: product._id,
      name: "Cron Variant 2",
      sku: `CRON-SKU-2-${Date.now()}`,
      price: 12,
      stockQuantity: 10,
      reservedQuantity: 0,
      status: "active",
      thumbnailImage: file._id,
    });
  });

  test("expired orders are cancelled and stock is released", async () => {
    const expiredOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: "Cron Variant",
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      subtotal: 20,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: 20,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    await Variant.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 2 },
    });

    await runOrderExpirationJob();

    const updatedOrder = await Order.findById(expiredOrder._id);
    const updatedVariant = await Variant.findById(variant._id);

    expect(updatedOrder.status).toBe("cancelled");
    expect(updatedOrder.expiresAt).toBeInstanceOf(Date);
    expect(updatedVariant.reservedQuantity).toBe(0);
  });

  test("non-expired pending orders are not cancelled and reservations stay", async () => {
    const pendingOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: "Cron Variant",
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      subtotal: 20,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: 20,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() + 60 * 1000),
    });

    await Variant.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 2 },
    });

    await runOrderExpirationJob();

    const updatedOrder = await Order.findById(pendingOrder._id);
    const updatedVariant = await Variant.findById(variant._id);

    expect(updatedOrder.status).toBe("pending");
    expect(updatedOrder.expiresAt).toBeUndefined();
    expect(updatedVariant.reservedQuantity).toBe(2);
  });

  test("paid orders are ignored even if reservation is in the past", async () => {
    const paidOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: "Cron Variant",
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      subtotal: 20,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: 20,
      status: "paid",
      reservationExpiresAt: new Date(Date.now() - 60 * 1000),
      paidAt: new Date(),
    });

    await Variant.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 2 },
    });

    await runOrderExpirationJob();

    const updatedOrder = await Order.findById(paidOrder._id);
    const updatedVariant = await Variant.findById(variant._id);

    expect(updatedOrder.status).toBe("paid");
    expect(updatedOrder.expiresAt).toBeUndefined();
    expect(updatedVariant.reservedQuantity).toBe(2);
  });

  test("expired order with multiple variants releases reservations for each", async () => {
    const expiredOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: "Cron Variant",
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
        {
          product: product._id,
          variant: variant2._id,
          name: "Cron Variant 2",
          sku: variant2.sku,
          price: 12,
          quantity: 3,
          subtotal: 36,
        },
      ],
      subtotal: 56,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: 56,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    await Variant.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 2 },
    });
    await Variant.findByIdAndUpdate(variant2._id, {
      $set: { reservedQuantity: 3 },
    });

    await runOrderExpirationJob();

    const updatedOrder = await Order.findById(expiredOrder._id);
    const updatedVariant1 = await Variant.findById(variant._id);
    const updatedVariant2 = await Variant.findById(variant2._id);

    expect(updatedOrder.status).toBe("cancelled");
    expect(updatedVariant1.reservedQuantity).toBe(0);
    expect(updatedVariant2.reservedQuantity).toBe(0);
  });

  test("expiration is idempotent (running twice does not double-release)", async () => {
    const expiredOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: "Cron Variant",
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      subtotal: 20,
      deliveryAddress: getValidDeliveryAddress(),
      location: getValidLocation(),
      deliveryFee: 0,
      total: 20,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    await Variant.findByIdAndUpdate(variant._id, {
      $set: { reservedQuantity: 2 },
    });

    await runOrderExpirationJob();

    const afterFirst = await Variant.findById(variant._id);
    const orderAfterFirst = await Order.findById(expiredOrder._id);
    const expiresAtFirst = orderAfterFirst.expiresAt;

    expect(orderAfterFirst.status).toBe("cancelled");
    expect(expiresAtFirst).toBeInstanceOf(Date);
    expect(afterFirst.reservedQuantity).toBe(0);

    await runOrderExpirationJob();

    const afterSecond = await Variant.findById(variant._id);
    const orderAfterSecond = await Order.findById(expiredOrder._id);

    expect(orderAfterSecond.status).toBe("cancelled");
    expect(orderAfterSecond.expiresAt.getTime()).toBe(expiresAtFirst.getTime());
    expect(afterSecond.reservedQuantity).toBe(0);
  });
});
