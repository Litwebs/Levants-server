# Subscription status and cutoff follow-up — 12 October 2026

Production Stripe webhook `we_1TBc0NC3OmOhqGTarpe46JdD` was re-inspected after the
owner added events. It is enabled, live, and targets
https://api.levantsdairy.co.uk/api/webhooks/stripe. All ten required subscription
events are covered; missingEvents is empty. This verifies configuration, not
live execution of the new application code, which remains undeployed.

Address updates after cutoff are staged for a later eligible delivery.
saveSubscriptionDeliveryAddress checks each order's cutoff and effective date;
locked, dispatched, delivered and refunded/cancelled orders are not rewritten.

The follow-up changes add a cancelled order delivery status and preserve payment
status refunded. Cancellation closes eligible open deliveries, including an
already refunded order from a prior pause, without refunding or restoring stock
again. Locked deliveries retain their existing fulfillment. No historical
production records are backfilled by this change.

Customer product, quantity, delivery-day, address and add-on editing is disabled
for paused, cancelled and cancellation-scheduled subscriptions. Direct product
and add-on pages are guarded too, including retained add-on retry state.
Resume and Cancel remain lifecycle actions for paused subscriptions; accounts
and unrelated active subscriptions remain manageable.

Coverage includes persisted cancellation flags and exactly-once stock restoration,
legacy orders with unproven stock, fulfillment states that must not be rewritten,
client editing policy, real Stripe/browser status cases, cancellation after pause,
and separate refunded payment/cancelled delivery display in admin and customer views.
The latest exact-commit UAT and production storefront preparation runs are the
authoritative evidence. Production merge/deployment still requires owner approval.

Rollback compatibility: this change adds `cancelled` to Order.deliveryStatus.
An older schema that rejects that value must not be used as an automatic rollback
after new cancellations have been saved. Use a schema-compatible rollback or a
forward fix; do not turn cancelled deliveries back into ordered records to satisfy
an old enum.

Legacy display compatibility is read-only: customer/admin order reads show a fully
refunded ordered subscription order as cancelled only when its own linked slot is
explicitly cancelled on the same London delivery date. Other fulfillment, mismatched
slots and paid/partially refunded orders are preserved. Historical records are not
rewritten by these read paths.
