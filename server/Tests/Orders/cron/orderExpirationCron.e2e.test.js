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

  beforeAll(() => {
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
  });

  beforeEach(async () => {
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
    expect(updatedVariant.reservedQuantity).toBe(0);
  });
});
