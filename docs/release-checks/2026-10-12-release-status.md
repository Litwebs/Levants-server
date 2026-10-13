# Subscription release status — 12 October 2026

## Current decision

Application hardening has passed the earlier release/UAT suites and runtime rehearsals. All six missing production unique indexes have now been created and verified. Production application HEAD remains `144badd63cb5263ad8eb89ce4f353816515f0fd4`; no application restart, deployment or main merge was performed.

The owner requested that verified work be consolidated into the existing `uat` branch. No new branch was created. UAT includes environment-gated deployment isolation. The promotion workflow requires the unchanged tested UAT tree and ancestry; use a reviewed merge, not squash/rebase or selective file removal. See [production preparation and server-first procedure](2026-10-12-production-release-review.md).

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

The earlier index consolidation added operational scripts, evidence and three automated index regression tests. The subsequent recovery-alert work adds an opt-in email dispatcher to the recovery audit, a durable notification-state collection and regression coverage. It does not perform financial repairs or change subscription payment ownership. Its exact commit must pass [the UAT pipeline](https://github.com/Litwebs/Levants-server/actions/workflows/uat.yml); use that commit's checks and configured-provider report as the authoritative result for the newly packaged UAT release.

## Remaining prerequisites

- Production Stripe endpoint still needs invoice.created, invoice.voided, invoice.marked_uncollectible, refund.created and refund.updated; owner will add them later. Reinspect afterward.
- Recovery-alert recipient selected by the owner: hm.mousavi.02@gmail.com. Configurable notification delivery, persistent deduplication, claim fencing and provider-safe retries are implemented on UAT; consult the latest exact-commit UAT pipeline and attached recovery-alert report for validation. Production activation remains part of the approved release. See [configuration and behavior](../SUBSCRIPTION_RECOVERY_ALERTS.md).
- Server main protection is now confirmed by the GitHub branch API, requiring Client lint and build, Backend tests, and Subscription E2E (Stripe test mode). Owner screenshots also show PR approval, current-branch, conversation-resolution, administrator enforcement, force-push and deletion settings; the connector cannot independently read those administration details. Client main protection is confirmed and requires Lint, typecheck and build. Production release gate is also now required on server main. The owner chose to leave UAT without a protection rule for now. The earlier main-branch-protection.json is a historical proposal, not a live configuration export.
- Historical records are not fully cleared: 13 funded upcoming orders lack stock-consumption journals; warehouse/operator evidence is required before inventory correction. One record has a planned 23 August delivery but recorded delivery on 19 August; operator confirmation is required before changing dates.
- No historical customer records, inventory, refunds or invoice allocations have been repaired speculatively.

The backup credential investigation confirmed application readWrite access cannot read the oplog or administer users. Backup infrastructure remains a separate deferred task, not a blocker for the completed index-only change.
