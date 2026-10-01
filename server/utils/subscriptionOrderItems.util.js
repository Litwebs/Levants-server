"use strict";

/** Replace only the recurring portion of an order. Paid one-off snapshots must
 * survive plan edits, including when they share a variant with a recurring item.
 */
function replaceRecurringOrderItems(order, recurringItems) {
  const addOns = (order.items || [])
    .filter((item) => item.isSubscriptionAddOn)
    .map((item) => (item.toObject ? item.toObject() : { ...item }));

  order.items = [
    ...(recurringItems || []).map((item) => ({
      product: item.product,
      variant: item.variant,
      name: item.name,
      sku: item.sku,
      price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
    })),
    ...addOns,
  ];
  order.subtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
  order.total = order.subtotal + (order.deliveryFee || 0);
}

module.exports = { replaceRecurringOrderItems };
