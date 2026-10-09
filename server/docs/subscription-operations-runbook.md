# Subscription release preflight and recovery

Run commands from `server/`, in the application's configured environment. This document does not authorize a production change. Use the exact server and portal revisions approved by the combined release gate; do not bypass a failed gate.

## Read-only preflight

```
node scripts/auditSubscriptionIntegrity.js --endpoint we_SELECTED_ENDPOINT
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint we_SELECTED_ENDPOINT
```

Both commands default to read-only. Exit 0 means the check passed, 2 means findings need review, and 1 means the check could not complete. A failed check is not a clean result. The integrity command disables automatic collection/index creation. It reports identifiers, dates and amounts without customer names, email addresses, card details or credentials.

Confirm the selected enabled endpoint URL points to this application's signed webhook route. Set `STRIPE_SUBSCRIPTION_WEBHOOK_ENDPOINT_ID` in the application environment when the account has multiple endpoints. Startup verification uses that selection. The audit checks delivery/order/mutation/invoice-plan/stock/payment/store-credit uniqueness, incomplete financial operations, invoice ownership links, unaccounted paid-order inventory, reservation totals, aged held draft invoices and delivery batch date drift. Normal new drafts and confirmed unpaid declines are not unresolved captures.

Required events include invoice creation, payment success/failure, void/uncollectible closure, subscription updates/deletion and refund creation/update/failure. With an authorized operator, `ensureStripeSubscriptionWebhooks.js --endpoint we_SELECTED_ENDPOINT --apply` adds missing events while preserving existing subscriptions. The script cannot verify endpoint routing, signing-secret installation or successful event delivery: verify those separately. Startup enforces financial unique indexes and refuses unsafe duplicates. Review findings before starting new workers against legacy data.

## Recover one saved operation

Inspect first. Select exactly one mode:

```
node scripts/recoverSubscriptionOperation.js --customer CUSTOMER_OBJECT_ID --operation ORIGINAL_UUID
node scripts/recoverSubscriptionOperation.js --customer CUSTOMER_OBJECT_ID --card
node scripts/recoverSubscriptionOperation.js --invoice in_ORIGINAL_INVOICE
```

An authorized operator adds `--apply` to the same command to replay that exact operation. Mutation recovery uses the stored original request, owner and payment keys. It uses the same locks, fencing and completion transactions as normal portal requests. A second application must reuse the saved result and must not move money again. A busy operation should be retried after its owning worker completes or its lease expires; do not erase locks or journals to force it through.

Unknown paid operations remain blocked until the original provider outcome is established. Aged requests inspect all provider history pages and reconcile an exact payment identity; they never blindly submit an expired financial key. A confirmed unpaid decline may use a saved new attempt with the current default card. An aged card operation inspects each command's desired provider state, saves a new nonfinancial key only for a still-needed command, and commits local pointers atomically.

An invoice recovery applies its original frozen delivery plan. A fully unallocated payment with unavailable stock or an unknown original agreement can be refunded once, with a durable ledger, paused billing and a portal notification. An invoice with existing allocations needs per-order reconciliation; this full-refund path refuses it. A paid add-on whose original target has closed is refunded using its original identity instead of attached to a different delivery.

## Inventory and legacy findings

For a draft blocked by stock, replenish through normal inventory administration, then apply recovery to that invoice. This reserves the frozen original quantities and resumes eligible billing. If the invoice is voided or marked uncollectible at Stripe, invoice recovery releases its unpaid hold. Never release an ambiguous paid hold merely because it is old.

Existing subscription orders without inventory consumption proof require accounting review. Do not backfill proof or restock them by guessing: the earlier code may not have consumed inventory. Likewise, historical invoices without original entitlements cannot safely infer deliveries from today's schedule. Reconcile original invoices, orders, allocations and refund history, then document the approved repair and rerun read-only preflight.

Every 15 minutes the subscription scheduler reports aged unresolved mutations, invoice plans, saved card operations, resumes and inventory holds under `[SubscriptionRecovery]`. Verify the scheduler is running and those error logs reach the operational alert destination. An emitted log is not proof that an alert was delivered. Review the audit again after recovery and before enabling production traffic.
