const Order = require("../../../models/order.model");
const Variant = require("../../../models/variant.model");

const refundService = require("../../../services/orders/orders.refund.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");

describe("RefundOrder", () => {
  test("returns 404 when order not found", async () => {
    const mongoose = require("mongoose");
    const res = await refundService.RefundOrder({
      orderId: new mongoose.Types.ObjectId(),
    });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  test("returns 409 when order is already fully refunded", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const order = await createOrder({
      status: "refunded",
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
      overrides: { paidAt: new Date() },
    });

    const res = await refundService.RefundOrder({ orderId: order._id });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(409);
  });

  test("returns 409 when refund is already pending", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const order = await createOrder({
      status: "refund_pending",
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
      overrides: { paidAt: new Date() },
    });

    const res = await refundService.RefundOrder({ orderId: order._id });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(409);
  });

  test("returns 400 when order is not paid", async () => {
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

    const res = await refundService.RefundOrder({ orderId: order._id });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.message).toMatch(/paid/i);
  });

  test("returns 400 when no Stripe payment reference exists", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product });
    const order = await createOrder({
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
      overrides: { paidAt: new Date() },
    });
    // Ensure no payment reference
    await Order.updateOne(
      { _id: order._id },
      { $unset: { stripePaymentIntentId: 1, stripeCheckoutSessionId: 1 } },
    );

    const res = await refundService.RefundOrder({ orderId: order._id });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.message).toMatch(/stripe/i);
  });

  test("successfully creates a full refund (stripe mock returns succeeded)", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10 });
    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity: 2,
      subtotal: 20,
    };
    const order = await createOrder({
      status: "paid",
      customer,
      items: [item],
      overrides: {
        paidAt: new Date(),
        total: 20,
        stripePaymentIntentId: "pi_test_refund",
      },
    });

    const res = await refundService.RefundOrder({
      orderId: order._id,
      amount: 20,
    });

    expect(res.success).toBe(true);
    expect(res.data.refundId).toBe("re_test_789");
    expect(res.data.status).toBe("succeeded");

    const updated = await Order.findById(order._id).lean();
    expect(updated.status).toBe("refunded");
    expect(updated.refunds).toHaveLength(1);
    expect(updated.refunds[0].status).toBe("succeeded");
  });

  test("restocks variants when restock=true and order is fully refunded", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10, stock: 5 });
    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: 10,
      quantity: 3,
      subtotal: 30,
    };
    const order = await createOrder({
      status: "paid",
      customer,
      items: [item],
      overrides: {
        paidAt: new Date(),
        total: 30,
        stripePaymentIntentId: "pi_test_restock",
      },
    });

    await refundService.RefundOrder({
      orderId: order._id,
      amount: 30,
      restock: true,
    });

    const updatedVariant = await Variant.findById(variant._id).lean();
    expect(updatedVariant.stockQuantity).toBe(8); // 5 + 3
  });

  test("returns 400 when requested amount exceeds remaining refundable amount", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10 });
    const order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 10,
          quantity: 1,
          subtotal: 10,
        },
      ],
      overrides: {
        paidAt: new Date(),
        total: 10,
        stripePaymentIntentId: "pi_test_exceed",
      },
    });

    const res = await refundService.RefundOrder({
      orderId: order._id,
      amount: 999,
    });

    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.message).toMatch(/exceeds/i);
  });
});

describe("toMinorUnits / toMajorUnits (via RefundOrder behaviour)", () => {
  test("handles zero-decimal currencies (JPY)", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 1000 });
    const order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 1000,
          quantity: 1,
          subtotal: 1000,
        },
      ],
      overrides: {
        paidAt: new Date(),
        total: 1000,
        currency: "JPY",
        stripePaymentIntentId: "pi_test_jpy",
      },
    });

    const res = await refundService.RefundOrder({
      orderId: order._id,
      amount: 1000,
    });

    expect(res.success).toBe(true);
  });
});

describe("computeRefundDerivedOrderStatus", () => {
  test("partially_refunded order stays partially_refunded after partial refund", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 10 });
    const order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
      overrides: {
        paidAt: new Date(),
        total: 20,
        stripePaymentIntentId: "pi_test_partial",
      },
    });

    const res = await refundService.RefundOrder({
      orderId: order._id,
      amount: 10, // partial
    });

    expect(res.success).toBe(true);
    const updated = await Order.findById(order._id).lean();
    expect(updated.status).toBe("partially_refunded");
  });
});
