jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async () => ({ success: true, response: { id: "email_test" } })),
);

const sendEmail = require("../../../Integration/Email.service");
const Order = require("../../../models/order.model");
const {
  sendOrderConfirmationEmailToCustomer,
} = require("../../../services/orders/orders.notifications.service");
const {
  createCustomer,
  createProduct,
  createVariant,
  createOrder,
} = require("../helpers/orderFactory");

describe("order confirmation concurrency", () => {
  test("webhook and browser retry can only send one customer confirmation", async () => {
    const customer = await createCustomer();
    customer.isGuest = false;
    await customer.save();

    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });
    const order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 5,
          quantity: 1,
          subtotal: 5,
        },
      ],
      overrides: { paidAt: new Date() },
    });

    const [first, second] = await Promise.all([
      sendOrderConfirmationEmailToCustomer({ orderId: order._id }),
      sendOrderConfirmationEmailToCustomer({ orderId: order._id }),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const updated = await Order.findById(order._id).lean();
    expect(updated.metadata?.orderConfirmationSentAt).toBeTruthy();
    expect(updated.metadata?.orderConfirmationClaim).toBeFalsy();
  });

  test("a failed provider send releases its claim so a later attempt can retry", async () => {
    const customer = await createCustomer();
    customer.isGuest = false;
    await customer.save();

    const product = await createProduct();
    const variant = await createVariant({ product, price: 5 });
    const order = await createOrder({
      status: "paid",
      customer,
      items: [
        {
          product: product._id,
          variant: variant._id,
          name: variant.name,
          sku: variant.sku,
          price: 5,
          quantity: 1,
          subtotal: 5,
        },
      ],
      overrides: { paidAt: new Date() },
    });

    sendEmail
      .mockResolvedValueOnce({ success: false, message: "temporary failure" })
      .mockResolvedValueOnce({ success: true, response: { id: "email_retry" } });

    const failed = await sendOrderConfirmationEmailToCustomer({
      orderId: order._id,
    });
    expect(failed.success).toBe(false);

    const afterFailure = await Order.findById(order._id).lean();
    expect(afterFailure.metadata?.orderConfirmationSentAt).toBeFalsy();
    expect(afterFailure.metadata?.orderConfirmationClaim).toBeFalsy();

    const retried = await sendOrderConfirmationEmailToCustomer({
      orderId: order._id,
    });
    expect(retried.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const afterRetry = await Order.findById(order._id).lean();
    expect(afterRetry.metadata?.orderConfirmationSentAt).toBeTruthy();
  });
});
