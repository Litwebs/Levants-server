"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() },
  refunds: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn() } }));
const stripe = require("../../utils/stripe.util");
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const { refundItemDecrease: refund } = require("../../services/customerPortal/subscriptionItemDecreaseRefund.service");
let mutation;
beforeEach(() => {
  jest.clearAllMocks();
  mutation = { _id: "m" };
  jest.spyOn(Mutation, "findOne").mockResolvedValue(mutation);
  jest.spyOn(Mutation, "updateOne").mockImplementation(async (_filter, update) => {
    if (update.$set.decreaseRefundSnapshot) mutation.decreaseRefundSnapshot = update.$set.decreaseRefundSnapshot;
    if (update.$set["decreaseRefundSnapshot.refund"]) mutation.decreaseRefundSnapshot.refund = update.$set["decreaseRefundSnapshot.refund"];
    for (const [path, value] of Object.entries(update.$set)) {
      const match = path.match(/^decreaseRefundSnapshot\.steps\.(\d+)\.refund$/);
      if (match) mutation.decreaseRefundSnapshot.steps[Number(match[1])].refund = value;
    }
    return { matchedCount: 1 };
  });
  jest.spyOn(Order, "findOne").mockReturnValue({ select: () => ({ lean: async () => ({ _id: "order", stripePaymentIntentId: "pi", amountPaid: 5 }) }) });
  jest.spyOn(Order, "countDocuments").mockResolvedValue(1);
  jest.spyOn(Customer, "findById").mockResolvedValue({ stripeCustomerId: "cus" });
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", amount_received: 500, currency: "gbp", customer: "cus" });
  stripe.refunds.create.mockReset().mockImplementation(async params => ({ id: "re", status: "succeeded", amount: params.amount }));
  stripe.refunds.retrieve.mockReset();
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
});
afterEach(() => jest.restoreAllMocks());
const run = () => refund({ _id: "s", customer: "c", subscriptionNumber: "SUB" }, 500, "op",
  [{ orderId: "order", amountMinor: 500 }]);
test("saves the immutable target before asking Stripe for a refund", async () => {
  expect((await run()).refundedMinor).toBe(500);
  expect(Mutation.updateOne.mock.invocationCallOrder[0]).toBeLessThan(stripe.refunds.create.mock.invocationCallOrder[0]);
  expect(Order.findOne).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: "ordered" }));
});
test("targets the edited delivery even when another paid delivery is locked", async () => {
  Order.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "open", stripePaymentIntentId: "shared_pi", amountPaid: 5 }) }) });
  const result = await refund({ _id: "s", customer: "c" }, 500, "op", [{ orderId: "open", amountMinor: 500 }]);
  expect(Order.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "open" }));
  expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ orderId: "open" }) }), expect.any(Object));
  expect(result.records[0].orderId).toBe("open");
});
test("an absent edited delivery cannot fall back to refunding a locked delivery", async () => {
  await expect(refund({ _id: "s", customer: "c" }, 500, "op", [])).rejects.toThrow("targets are required");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("retries a lost response with exactly the saved refund request", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(run()).rejects.toThrow("response lost");
  expect((await run()).refundedMinor).toBe(500);
  expect(stripe.refunds.create.mock.calls[0]).toEqual(stripe.refunds.create.mock.calls[1]);
  expect(Order.findOne).toHaveBeenCalledTimes(1);
});
test("a failed checkpoint never starts a refund", async () => {
  Mutation.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
  await expect(run()).rejects.toThrow("No refund was started");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("retrieves a pending refund and waits for confirmed success", async () => {
  stripe.refunds.create.mockResolvedValueOnce({ id: "re", amount: 500, status: "pending" });
  await expect(run()).rejects.toThrow("not confirmed");
  stripe.refunds.retrieve.mockResolvedValue({ id: "re", amount: 500, status: "succeeded" });
  expect((await run()).refundedMinor).toBe(500);
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
test("an expired ambiguous key cannot start another refund", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("lost"));
  await expect(run()).rejects.toThrow();
  mutation.decreaseRefundSnapshot.startedAt = new Date(0);
  await expect(run()).rejects.toThrow("aged decrease refund");
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});

function splitOrder() {
  Order.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "order", amountPaid: 7.5,
    stripePaymentIntentId: "pi_base", paymentAllocations: [
      { paymentIntentId: "pi_base", amountMinor: 250 }, { paymentIntentId: "pi_increase", amountMinor: 500 },
    ] }) }) });
  stripe.paymentIntents.retrieve.mockImplementation(async id => ({ id, status: "succeeded", currency: "gbp", customer: "cus",
    amount_received: id === "pi_base" ? 250 : 500 }));
  stripe.refunds.create.mockImplementation(async params => ({ id: `re_${params.payment_intent}`, amount: params.amount,
    payment_intent: params.payment_intent, status: "succeeded" }));
}
test("a decrease splits across the invoice and the paid increase allocations", async () => {
  splitOrder();
  const result = await run();
  expect(result.records.map(record => [record.paymentIntentId, record.refundedMinor])).toEqual([["pi_base", 250], ["pi_increase", 250]]);
  expect(mutation.decreaseRefundSnapshot.steps).toHaveLength(2);
  expect(Mutation.updateOne.mock.invocationCallOrder[0]).toBeLessThan(stripe.refunds.create.mock.invocationCallOrder[0]);
});
test("retrying a failed second step retrieves the first refund without refunding it again", async () => {
  splitOrder();
  stripe.refunds.create.mockImplementationOnce(async params => ({ id: "re_base", amount: params.amount, status: "succeeded" }))
    .mockRejectedValueOnce(new Error("response lost"));
  await expect(run()).rejects.toThrow("response lost");
  const original = stripe.refunds.create.mock.calls[1];
  stripe.refunds.retrieve.mockResolvedValue({ id: "re_base", amount: 250, status: "succeeded", payment_intent: "pi_base" });
  expect((await run()).refundedMinor).toBe(500);
  expect(stripe.refunds.create.mock.calls).toHaveLength(3);
  expect(stripe.refunds.create.mock.calls[2]).toEqual(original);
});
test("insufficient capture is detected before the first split refund", async () => {
  splitOrder();
  stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: "cus", currency: "gbp", amount_received: 100 });
  await expect(run()).rejects.toThrow("Insufficient allocated");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(mutation.decreaseRefundSnapshot).toBeUndefined();
});
test.each([{ customer: "foreign" }, { currency: "usd" }])("rejects a foreign capture before saving a refund plan: %j", async difference => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: "cus", currency: "gbp", amount_received: 500, ...difference });
  await expect(run()).rejects.toThrow("does not match");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("two delivery targets share one captured budget without overdrawing it", async () => {
  Order.findOne.mockImplementation(filter => ({ select: () => ({ lean: async () => ({ _id: filter._id,
    stripePaymentIntentId: "pi_shared", paymentAllocations: [{ paymentIntentId: "pi_shared", amountMinor: 300 }] }) }) }));
  await expect(refund({ _id: "s", customer: "c" }, 600, "op",
    [{ orderId: "one", amountMinor: 300 }, { orderId: "two", amountMinor: 300 }])).rejects.toThrow("Insufficient allocated");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("an external refund on a shared payment cannot be attributed to the wrong delivery", async () => {
  Order.countDocuments.mockResolvedValue(2);
  stripe.refunds.list.mockResolvedValue({ data: [{ id: "external", amount: 50, status: "succeeded" }], has_more: false });
  await expect(run()).rejects.toThrow("unattributed");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
