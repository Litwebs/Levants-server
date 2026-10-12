"use strict";
const { listAllStripePages } = require("../../utils/stripePagination.util");
test("reads the 101st record and retains the original customer filter", async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ id: `record-${index}` }));
  const list = jest.fn().mockResolvedValueOnce({ data: first, has_more: true })
    .mockResolvedValueOnce({ data: [{ id: "recovery-target" }], has_more: false });
  expect((await listAllStripePages(list, { customer: "cus" })).at(-1).id).toBe("recovery-target");
  expect(list.mock.calls[1][0]).toEqual({ customer: "cus", limit: 100, starting_after: "record-99" });
});
test("a repeated cursor or empty unfinished page fails closed", async () => {
  const repeat = jest.fn(async () => ({ data: [{ id: "same" }], has_more: true }));
  await expect(listAllStripePages(repeat, {})).rejects.toThrow("did not advance");
  await expect(listAllStripePages(async () => ({ data: [], has_more: true }), {})).rejects.toThrow("did not advance");
});
