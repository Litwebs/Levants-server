# Subscription release status — 12 October 2026

## Current decision

Application hardening has passed the earlier release/UAT suites and runtime rehearsals. All six missing production unique indexes have now been created and verified. Production application HEAD remains `144badd63cb5263ad8eb89ce4f353816515f0fd4`; no application restart, deployment or main merge was performed.

The owner requested that verified work be consolidated into the existing `uat` branch. No new branch was created. UAT includes environment-specific deployment isolation; merging the entire UAT branch into main is not a production release procedure.

## Index evidence

[Run 38236537775](https://github.com/Litwebs/Levants-server/actions/runs/38236537775) passed both gated jobs:

- Isolated UAT: six exact indexes created and verified, six duplicate inserts rejected, partial-index exclusions allowed, a duplicate in the final collection prevented all writes, conflicting definitions refused, documents unchanged, repeat application idempotent.
- Fresh production plan: all six absent, zero conflicting duplicate groups, resource checks passed.
- Production application: all six created sequentially and independently verified.
- Production application process identities, HEAD and public health unchanged before/after.
- Synthetic fixture database removed.
- No backup was taken. Owner approved the index-only scope after clarifying that a backup is a precaution rather than an index-creation requirement. Atlas synchronization and backup scheduling are deferred.

| Collection | Verified unique index |
| --- | --- |
| paymentmethods | customer_1_provider_1_providerReference_1; partial providerReference string |
| subscriptionmutations | customer_1_operationId_1 |
| subscriptioninvoicefulfillments | subscription_1_invoiceId_1 |
| subscriptionstockreservations | key_1 |
| payments | subscriptionInvoiceKey_1; partial subscriptionInvoiceKey string |
| storecredittransactions | customer_1_idempotencyKey_1; partial idempotencyKey string |

## Release verification

Prior exact application release CI: [38222493736](https://github.com/Litwebs/Levants-server/actions/runs/38222493736), 161 suites / 1,324 backend tests, 109 real Stripe/browser tests and admin checks passed.

Prior exact deployed UAT: [38222542171 attempt 2](https://github.com/Litwebs/Levants-server/actions/runs/38222542171/attempts/2), all 109 real Stripe/browser tests, deployment and nine configured provider checks passed. Attempt 1's signed-webhook fixture timeout remains recorded in the historical report.

Runtime checks: [38227286164](https://github.com/Litwebs/Levants-server/actions/runs/38227286164), actual London spring/autumn maintenance gating, actionable recovery logs, rollback/restoration and production identity preservation passed.

The consolidation adds operational scripts, evidence and three automated index regression tests. It does not alter subscription business handlers. Its exact commit must pass [the UAT pipeline](https://github.com/Litwebs/Levants-server/actions/workflows/uat.yml); use that commit's checks and configured-provider report as the authoritative result for the newly packaged UAT release.

## Remaining prerequisites

- Production Stripe endpoint still needs invoice.created, invoice.voided, invoice.marked_uncollectible, refund.created and refund.updated; owner will add them later. Reinspect afterward.
- Recovery log identifiers are verified; an operator notification destination and delivery verification remain outstanding. Existing new-order email delivery does not prove recovery-alert delivery.
- Main-branch protections are prepared in main-branch-protection.json but unapplied. The connector has no branch-protection write operation; browser fallback requires owner approval.
- Historical records are not fully cleared: 13 funded upcoming orders lack stock-consumption journals; warehouse/operator evidence is required before inventory correction. One record has a planned 23 August delivery but recorded delivery on 19 August; operator confirmation is required before changing dates.
- No historical customer records, inventory, refunds or invoice allocations have been repaired speculatively.

The backup credential investigation confirmed application readWrite access cannot read the oplog or administer users. Backup infrastructure remains a separate deferred task, not a blocker for the completed index-only change.
