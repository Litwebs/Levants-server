# Orders workflow coverage

This suite tests the unmodified application on `fix/test`. All new implementation
is test code/configuration. The fixtures use a newly created in-memory MongoDB
replica set, local staff/customer records and Stripe test-mode payment captures.
No production/UAT connection, deployment, restart or customer-data copy is used.
Email is captured using the existing E2E outbox. Only Cloudinary's network upload
transport is replaced; real compression, upload validation, file records, order
services/controllers, authentication and permission middleware are exercised.

## Coverage map

| Workflow | Tests |
|---|---|
| Listing/details | Active versus archived records, order/customer searches, empty state, source/payment/delivery filters, total sorting, pagination/page size, customer/address/item/total snapshots |
| Delivery | Admin status changes, payment/stock preservation, current-status guard, cancel, proof upload, note persistence, storage failure, repeated-delivery email deduplication |
| Driver safety | Delivered lock in UI and single API, bulk bypass rejection |
| Imported items | Quantity changes, delivery-fee inclusion/exclusion, variant add/remove, last-item guard, cancelled edit, network failure, persisted pricing and unchanged stock |
| Imported payment | Full/partial payment, payment-only staff, unpaid transition, protected order rejection |
| Refunds | Real captured test payment, partial/full remainder, excessive/invalid amounts, invalid browser input, cancellation, duplicate clicks, restock, signed-webhook replay and exact remote/local totals |
| Bulk/deletion | Selected-only status/date changes, clear selection, single/bulk archive, cancelled delete, reservation release, archived mutation protection |
| Stock preview | Selected orders and CSV quantities, no inventory mutation |
| Access control | Anonymous requests, granular reader/editor/payer/refunder/deleter/no-access roles, customer token isolation and cross-customer order ownership |
| Validation | Empty/invalid payloads, quantities/variants, price tampering, protected payments, proof MIME/size, missing and archived orders, note length |

Admin lifecycle and refund browser scenarios run on desktop and mobile Chromium.
Direct API permission/validation cases run once and are explicitly labelled API
tests; they are not presented as browser UI coverage. Stock preview and variant-editing browser scenarios also run on desktop and
mobile.

Every test starts from fresh database fixtures. Failed safety assertions remain
failures; there are no skipped, expected-failure or automatically retried tests.
Failures must be classified as harness defects, verified application bugs, or
unsettled business-policy expectations. Application fixes require separate scope.

## Limits to report explicitly

This is a documented coverage map, not a guarantee of zero defects. External
Cloudinary/Resend service availability and real production data are not tested.
Existing one-time storefront checkout browser coverage remains in the portal
suite; this new suite concentrates on order administration and its API boundary.
New workflows discovered while testing must be added to this map before calling
the orders coverage complete. Production release gates are not changed here.

Run after installing backend/admin dependencies, Chromium and Stripe CLI:

```sh
cd server
E2E_USE_STRIPE_CLI=1 npx playwright test --config playwright.orders.config.js
```

Export Stripe test keys and the test JWT secrets as in the Orders workflow
verification action. The stack refuses live Stripe keys and ignores database
URIs supplied by the caller.
