"use strict";
function assertAddOnFulfillmentEligible({ subscription, delivery, order, operationId, cutoffAt, now }) {
  const attached = delivery?.addOns?.some(addOn => addOn.operationId === operationId);
  const allocated = order?.paymentAllocations?.some(allocation => allocation.idempotencyKey === `delivery-add-on:${operationId}`);
  // A completed application can be replayed after dispatch without changing it.
  if (attached && (delivery.order ? allocated : true)) return;
  if (!delivery || subscription.status !== 'active' || !cutoffAt || now >= cutoffAt.getTime() ||
      !['scheduled', 'generated'].includes(delivery.status) ||
      (delivery.order ? !order || order.deliveryStatus !== 'ordered' ||
        !['paid', 'partially_paid', 'partially_refunded'].includes(order.status) : delivery.status !== 'scheduled')) {
    const error = new Error('Your payment succeeded, but the original delivery can no longer accept the add-on. Please contact support to reconcile or refund this payment.');
    error.code = 'ADD_ON_FULFILLMENT_CLOSED';
    throw error;
  }
}
module.exports = { assertAddOnFulfillmentEligible };
