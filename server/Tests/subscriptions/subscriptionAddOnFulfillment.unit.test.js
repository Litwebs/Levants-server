const { assertAddOnFulfillmentEligible: check } = require('../../services/customerPortal/subscriptionAddOnFulfillment.service');
const fixture = () => ({ subscription: { status: 'active' }, delivery: { status: 'generated', order: 'o', addOns: [] },
  order: { status: 'paid', deliveryStatus: 'ordered', paymentAllocations: [] }, operationId: 'op', cutoffAt: new Date(2000), now: 1000 });
it('accepts an editable paid order', () => { expect(() => check(fixture())).not.toThrow(); });
it.each(['dispatched', 'in_transit', 'delivered', 'returned'])('rejects %s fulfillment after payment', deliveryStatus => {
  const state = fixture(); state.order.deliveryStatus = deliveryStatus;
  expect(() => check(state)).toThrow(/payment succeeded/);
});
it('rejects a cutoff crossed while waiting for payment', () => {
  expect(() => check({ ...fixture(), now: 2000 })).toThrow(/payment succeeded/);
});
it('rejects a missing linked order rather than treating it as an ungenerated delivery', () => {
  expect(() => check({ ...fixture(), order: null })).toThrow(/payment succeeded/);
});
it('permits a completed replay after dispatch without adding products again', () => {
  const state = fixture(); state.order.deliveryStatus = 'dispatched'; state.now = 3000;
  state.delivery.addOns = [{ operationId: 'op' }];
  state.order.paymentAllocations = [{ idempotencyKey: 'delivery-add-on:op' }];
  expect(() => check(state)).not.toThrow();
});
it('does not treat a slot-only record as completed when its order lacks the allocation', () => {
  const state = fixture(); state.delivery.addOns = [{ operationId: 'op' }]; state.order.deliveryStatus = 'dispatched';
  expect(() => check(state)).toThrow(/payment succeeded/);
});
it('supports an ungenerated scheduled delivery', () => {
  const state = fixture(); state.delivery = { status: 'scheduled', addOns: [] }; state.order = null;
  expect(() => check(state)).not.toThrow();
});
