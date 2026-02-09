const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Order = require("../../../models/order.model");
const Product = require("../../../models/product.model");
const ProductVariant = require("../../../models/variant.model");
const Customer = require("../../../models/customer.model");

const {
  runOrderExpirationJob,
} = require("../../../scripts/orderExpiration.scheduler");

describe("ORDER EXPIRATION CRON (E2E)", () => {
  let customer;
  let product;
  let variant;
  let expiredOrder;
  let activeOrder;

  beforeEach(async () => {
    customer = await Customer.create({
      firstName: "Cron",
      lastName: "Tester",
      email: "cron@test.com",
    });

    product = await Product.create({
      name: "Cron Product",
      slug: `cron-product-${Date.now()}`,
      description: "Cron test product",
      category: "test",
      status: "active",
      thumbnailImage: "/product.png",
    });

    variant = await ProductVariant.create({
      product: product._id,
      name: "Cron Variant",
      sku: `CRON-${Date.now()}`,
      price: 3,
      stockQuantity: 10,
      reservedQuantity: 3,
      status: "active",
      thumbnailImage: "/cron.png",
    });

    // 🔴 EXPIRED ORDER
    expiredOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 3,
          subtotal: 9,
        },
      ],
      subtotal: 9,
      deliveryFee: 0,
      total: 9,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() - 60 * 1000), // expired
    });

    // 🟢 ACTIVE ORDER (should NOT be touched)
    activeOrder = await Order.create({
      customer: customer._id,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          subtotal: 3,
        },
      ],
      subtotal: 3,
      deliveryFee: 0,
      total: 3,
      status: "pending",
      reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
  });

  /**
   * =========================
   * SUCCESS
   * =========================
   */

  test("expired orders are cancelled and stock is released", async () => {
    await runOrderExpirationJob();

    const updatedOrder = await Order.findById(expiredOrder._id);
    const updatedVariant = await ProductVariant.findById(variant._id);

    expect(updatedOrder.status).toBe("cancelled");
    expect(updatedOrder.expiresAt).toBeDefined();

    // Reserved stock released
    expect(updatedVariant.reservedQuantity).toBe(0);
    expect(updatedVariant.stockQuantity).toBe(10);
  });

  /**
   * =========================
   * SAFETY
   * =========================
   */

  test("non-expired orders are untouched", async () => {
    await runOrderExpirationJob();

    const untouchedOrder = await Order.findById(activeOrder._id);
    expect(untouchedOrder.status).toBe("pending");
  });

  /**
   * =========================
   * IDEMPOTENCY
   * =========================
   */

  test("cron is idempotent (does not double-release stock)", async () => {
    await runOrderExpirationJob();
    await runOrderExpirationJob();

    const updatedVariant = await ProductVariant.findById(variant._id);
    expect(updatedVariant.reservedQuantity).toBe(0);
  });

  /**
   * =========================
   * EDGE CASES
   * =========================
   */

  test("no crash when no expired orders exist", async () => {
    await Order.deleteMany({ _id: expiredOrder._id });

    await expect(runOrderExpirationJob()).resolves.not.toThrow();
  });
});
