"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { list: jest.fn() } }));
const stripe = require("../../utils/stripe.util");
const { findFrozenPayment } = require("../../services/customerPortal/subscriptionPaymentRecovery.service");
const snapshot = { chargeParams: { customer: "cus", currency: "gbp", amount: 500,
  metadata: { subscriptionId: "s", operationId: "op", type: "delivery_add_on" } } };
const paid = () => ({ id: "paid", status: "succeeded", customer: "cus", currency: "gbp",
  amount: 500, amount_received: 500, metadata: snapshot.chargeParams.metadata });
beforeEach(() => stripe.paymentIntents.list.mockReset());
test("recovers the original capture beyond page one without creating a new charge", async () => {
  stripe.paymentIntents.list.mockResolvedValueOnce({ data: [{ id: "unrelated" }], has_more: true })
    .mockResolvedValueOnce({ data: [paid()], has_more: false });
  expect((await findFrozenPayment(snapshot)).id).toBe("paid");
  expect(stripe.paymentIntents.list.mock.calls[1][0].starting_after).toBe("unrelated");
});
test.each([{ data: [] }, { data: [paid(), { ...paid(), id: "duplicate" }] }])("does not guess when the provider result is ambiguous", async ({ data }) => {
  stripe.paymentIntents.list.mockResolvedValue({ data, has_more: false });
  await expect(findFrozenPayment(snapshot)).rejects.toThrow("ambiguous");
});
test.each([{ customer: "other" }, { currency: "usd" }, { amount_received: 499 }, { amount: 501 }])(
  "rejects a recovered capture that differs from the saved purchase", async mismatch => {
    stripe.paymentIntents.list.mockResolvedValue({ data: [{ ...paid(), ...mismatch }], has_more: false });
    await expect(findFrozenPayment(snapshot)).rejects.toThrow("does not match");
  });
test("an earlier unpaid decline does not hide the one captured retry", async () => {
  stripe.paymentIntents.list.mockResolvedValue({ data: [paid(), { ...paid(), id: "declined", status: "requires_payment_method", amount_received: 0 }], has_more: false });
  expect((await findFrozenPayment(snapshot)).id).toBe("paid");
});
