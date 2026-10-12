const { prepareSingleDayTransition: prepare } = require('../../services/customerPortal/subscriptionSingleDayTransition.service');
const item = quantity => ({ variant: 'v', quantity, unitPrice: 2.5 });
const subscription = () => ({ frequency: 'weekly', preferredDeliveryDays: [0, 3], items: [item(4)],
  deliveryDayPlans: [{ day: 0, items: [item(3)] }, { day: 3, items: [item(1)] }] });
const payload = quantity => [{ day: 3, items: [{ variantId: 'v', quantity }] }];
it('accepts the portal payload and retains only the surviving live products', () => {
  const sub = subscription();
  expect(prepare(sub, [3], 'weekly', payload(1)).items).toEqual([item(1)]);
  expect(sub.items).toEqual([item(4)]);
});
it('also converts API schedule-only requests', () => {
  expect(prepare(subscription(), [3], 'weekly').items).toEqual([item(1)]);
});
it('converts pending plans without losing the address, date or live quantity', () => {
  const sub = subscription();
  sub.pendingChanges = { items: [item(7)], deliveryDayPlans: [{ day: 0, items: [item(5)] }, { day: 3, items: [item(2)] }],
    deliveryAddress: { line1: 'New address' }, effectiveFrom: '2030-01-01', preferredDeliveryDays: [0, 3] };
  const result = prepare(sub, [3], 'weekly', payload(2));
  expect(result.items).toEqual([item(1)]);
  expect(result.pendingChanges).toEqual({ ...sub.pendingChanges, items: [item(2)], deliveryDayPlans: [],
    preferredDeliveryDay: 3, preferredDeliveryDays: [3] });
});
it('rejects combined product changes before any settlement', () => {
  expect(prepare(subscription(), [3], 'weekly', payload(2)).error).toMatch(/separately/);
});
it('does not collapse unrelated cadence or multi-day updates', () => {
  expect(prepare(subscription(), [0, 3], 'weekly', payload(1))).toBeNull();
  expect(prepare(subscription(), [3], 'monthly', payload(1))).toBeNull();
});
it('does not infer products for an entirely new day', () => {
  expect(prepare(subscription(), [2], 'weekly').error).toMatch(/existing/);
});
it('rejects missing retained plans instead of carrying aggregate quantities', () => {
  const sub = subscription(); sub.deliveryDayPlans.pop();
  expect(prepare(sub, [3], 'weekly').error).toMatch(/no product plan/);
});
it('preserves legacy per-delivery items when explicit plans do not exist', () => {
  const sub = subscription(); sub.deliveryDayPlans = [];
  expect(prepare(sub, [3], 'weekly').items).toEqual([item(4)]);
});
