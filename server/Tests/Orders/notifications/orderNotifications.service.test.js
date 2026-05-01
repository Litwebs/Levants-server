jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true, response: { id: "email_test" } })),
);

const sendEmail = require("../../../Integration/Email.service");

const Order = require("../../../models/order.model");
const Customer = require("../../../models/customer.model");
const User = require("../../../models/user.model");
const Role = require("../../../models/role.model");

const notifService = require("../../../services/orders/orders.notifications.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sendOrderConfirmationEmailToCustomer
// ---------------------------------------------------------------------------
describe("sendOrderConfirmationEmailToCustomer", () => {
  test("returns error when orderId is missing", async () => {
    const res = await notifService.sendOrderConfirmationEmailToCustomer({});
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/orderId/i);
  });

  test("returns error when order not found", async () => {
    const mongoose = require("mongoose");
    const res = await notifService.sendOrderConfirmationEmailToCustomer({
      orderId: new mongoose.Types.ObjectId(),
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  test("skips when order status is not paid", async () => {
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

    const res = await notifService.sendOrderConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.skipped).toBe(true);
    expect(res.data.reason).toBe("not_paid");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("skips when confirmation already sent (idempotency)", async () => {
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
      overrides: {
        metadata: { orderConfirmationSentAt: new Date().toISOString() },
        paidAt: new Date(),
      },
    });

    const res = await notifService.sendOrderConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.skipped).toBe(true);
    expect(res.data.reason).toBe("already_sent");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("sends confirmation email for a paid order", async () => {
    const customer = await createCustomer();
    const product = await createProduct();
    const variant = await createVariant({ product, price: 5.5 });
    const item = {
      product: product._id,
      variant: variant._id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      quantity: 2,
      subtotal: 11,
    };
    const order = await createOrder({
      status: "paid",
      customer,
      items: [item],
      overrides: { paidAt: new Date() },
    });

    const res = await notifService.sendOrderConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, template] = sendEmail.mock.calls[0];
    expect(to).toBe(customer.email);
    expect(subject).toMatch(/confirmation/i);
    expect(template).toBe("orderConfirmation");

    // Idempotency marker saved
    const updated = await Order.findById(order._id).lean();
    expect(updated.metadata?.orderConfirmationSentAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// sendRefundConfirmationEmailToCustomer
// ---------------------------------------------------------------------------
describe("sendRefundConfirmationEmailToCustomer", () => {
  test("returns error when orderId is missing", async () => {
    const res = await notifService.sendRefundConfirmationEmailToCustomer({});
    expect(res.success).toBe(false);
  });

  test("skips when order status is not refunded", async () => {
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

    const res = await notifService.sendRefundConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.skipped).toBe(true);
    expect(res.data.reason).toBe("not_refunded");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("skips when refund confirmation already sent", async () => {
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
      overrides: {
        paidAt: new Date(),
        metadata: { refundConfirmationSentAt: new Date().toISOString() },
      },
    });

    const res = await notifService.sendRefundConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.skipped).toBe(true);
    expect(res.data.reason).toBe("already_sent");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("sends refund confirmation email", async () => {
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

    const res = await notifService.sendRefundConfirmationEmailToCustomer({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, template] = sendEmail.mock.calls[0];
    expect(to).toBe(customer.email);
    expect(subject).toMatch(/refund/i);
    expect(template).toBe("refundConfirmation");

    const updated = await Order.findById(order._id).lean();
    expect(updated.metadata?.refundConfirmationSentAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// sendNewOrderAlertEmailToUsers
// ---------------------------------------------------------------------------
describe("sendNewOrderAlertEmailToUsers", () => {
  test("returns error when orderId is missing", async () => {
    const res = await notifService.sendNewOrderAlertEmailToUsers({});
    expect(res.success).toBe(false);
  });

  test("returns error when order not found", async () => {
    const mongoose = require("mongoose");
    const res = await notifService.sendNewOrderAlertEmailToUsers({
      orderId: new mongoose.Types.ObjectId(),
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  test("sends 0 emails when no admins have newOrders enabled", async () => {
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

    const res = await notifService.sendNewOrderAlertEmailToUsers({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("sends alert email when admin has newOrders notifications enabled", async () => {
    // Create an admin role with orders.read permission
    const role = await Role.create({
      name: `alert-role-${Date.now()}`,
      permissions: ["orders.read"],
      isSystem: false,
    });

    await User.create({
      name: "Alert Admin",
      email: `alert-admin-${Date.now()}@test.com`,
      passwordHash: "x",
      role: role._id,
      status: "active",
      preferences: { notifications: { newOrders: true } },
    });

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

    const res = await notifService.sendNewOrderAlertEmailToUsers({
      orderId: order._id,
    });

    expect(res.success).toBe(true);
    expect(res.data.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, template] = sendEmail.mock.calls[0];
    expect(subject).toMatch(/new order/i);
    expect(template).toBe("newOrderAlert");
  });
});
