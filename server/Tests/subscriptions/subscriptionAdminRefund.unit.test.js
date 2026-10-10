"use strict";
jest.mock("../../utils/stripe.util", () => ({ refunds: { create: jest.fn() } }));
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const { RefundOrder } = require("../../services/orders/orders.refund.service");
afterEach(() => jest.restoreAllMocks());
test.each([{ subscription: "s" }, { orderType: "subscription_generated" }])(
  "generic admin refunds cannot settle a shared subscription capture: %j", async identity => {
    const order = { ...identity, status: "paid", stripePaymentIntentId: "shared-invoice", amountPaid: 20,
      paymentAllocations: [{ paymentIntentId: "shared-invoice", amountMinor: 1000 },
        { paymentIntentId: "increase", amountMinor: 1000 }] };
    jest.spyOn(Order, "findById").mockReturnValue({ select: async () => order });
    const restock = jest.spyOn(Variant, "findByIdAndUpdate");
    const result = await RefundOrder({ orderId: "order", amount: 20, restock: true });
    expect(result).toMatchObject({ success: false, statusCode: 409 });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(restock).not.toHaveBeenCalled();
    expect(order.status).toBe("paid");
  });
