# Superseded action-plan snapshot

The six indexes were created and verified in run 38236537775. Backup setup was deferred by the owner and was not required for the index-only application. See [current release status](2026-10-12-release-status.md). The original plan below is retained as historical evidence.

# Remaining production actions — 12 October 2026

Stripe webhook event changes are deferred to the owner. No main merge/deployment, production record repair, service restart or index write has been performed.

## Six financial indexes

[Read-only dry run 38230837263](https://github.com/Litwebs/Levants-server/actions/runs/38230837263) passed against production. All six approved definitions are absent, with no conflicting index definitions or duplicate groups.

`server/scripts/createProductionFinancialIndexes.cjs` defaults to a read-only plan. Its explicit `--apply` mode refuses to proceed unless a root-private backup manifest identifies this database/release, records successful restore plus oplog replay, is less than 24 hours old, and matches the archive checksum. It does not drop indexes, import application models, change application data or contact Stripe. An apply failure reports any indexes already created; it must be investigated rather than automatically dropping them.

Only the dry-run mode has been exercised against production. Apply has not been executed or certified by this run.

| Collection | Required unique key | Partial filter |
| --- | --- | --- |
| paymentmethods | customer, provider, providerReference | providerReference is a string |
| subscriptionmutations | customer, operationId | None |
| subscriptioninvoicefulfillments | subscription, invoiceId | None |
| subscriptionstockreservations | key | None |
| payments | subscriptionInvoiceKey | subscriptionInvoiceKey is a string |
| storecredittransactions | customer, idempotencyKey | idempotencyKey is a string |

## Backup prerequisite: blocked by credentials

[Read-only backup access inspection 38231109627](https://github.com/Litwebs/Levants-server/actions/runs/38231109627) returned MongoDB authorization error **13** for reading `local.oplog.rs`. No backup connection is configured in the application environment. The existing restore helper uses shell-expanded DB_USER/DB_PASS values that are not present in that environment; no credentials were printed or extracted from authentication caches/history.

The database is a transaction-capable MongoDB 8.0.19 replica set. Its earlier metadata scan reported approximately 20 MB of application data, no other application databases visible, and approximately 6 GB available host memory. These are preflight observations, not resource guarantees.

No active MongoDB backup cron job, Mongo backup timer or database archive was established in the inspected locations. The matched timer is `dpkg-db-backup.timer`, which does not back up MongoDB. Local rsyslog is active, with no inspected remote forwarding rule; known external collector services are inactive/unavailable.

A backup-capable database credential or an existing verified snapshot is needed next. Prefer a dedicated backup account over expanding the application account. MongoDB's [built-in backup role](https://www.mongodb.com/docs/manual/reference/built-in-roles/) supports database backup. The [tool backup documentation](https://www.mongodb.com/docs/database-tools/mongodump/) explains capturing writes with `--oplog`; a plain export while writes continue is not the intended consistent-restore proof.

Proposed recovery exercise:
1. Validate the backup credential against the configured production database/replica set. Keep credentials in a protected file or an Actions secret, never chat/logs.
2. Capture a consistent protected backup and retain its checksum/manifest.
3. Restore/replay it into a separate authenticated temporary MongoDB instance of the matching version, with a bounded CPU/memory budget. Do not put production data into UAT.
4. Verify restoration and remove the temporary instance/data, preserving the protected backup.
5. Recheck duplicates immediately before creating/verifying only the six indexes.

Do not run the existing restore helper against production or restart production to work around backup permissions.

## Repository protections: prepared, not applied

`docs/release-checks/main-branch-protection.json` contains exact protection payloads:
- Server: require a PR and the successful **Production release gate**, with an up-to-date branch.
- Client: require a PR and successful **Lint, typecheck and build**, with an up-to-date branch.
- Enforce for administrators; reject force-pushes and branch deletion.
- Zero mandatory peer approvals avoids blocking the current owner from merging their own PR. Set one only if another reviewer is available; the PR/check requirements still apply.

The connected GitHub tools expose no branch-protection write operation. Applying these through GitHub browser settings requires approval for that connector fallback.

## Recovery/scheduler alert routing: not established

Actual new-order emails and UAT lifecycle emails have reached the connected operator inbox. That is not proof that a recovery/scheduler log reaches it. The candidate now logs useful recovery identifiers; an external alert route remains missing/unverified.

Suggested destination is the existing order-alert operator inbox. Confirm the intended destination before enabling new notifications, then exercise one clearly labelled UAT alert through the actual route. Do not test by creating an unresolved financial operation in production.

## Historical records: evidence and proposed review

- All 13 outstanding legacy orders reconcile financially. They have no consumed-stock journals, and no inventory/stock/audit/history collections were found in the production collection inventory. Physical stock and separate administrative adjustments cannot be reconstructed from those fields alone. Review original inventory counts/adjustments before applying any consumption/restock repair.
- `ORD-20260816-H9GEWU` has a planned order date of 23 August but is in the 19 August batch. The batch was dispatched on 19 August and the order's recorded deliveredAt is **19 August 2026 12:27 London**. No delivery-proof URL was present.
- This establishes an early recorded fulfillment relative to the plan. It does not establish whether it was intentional or whether the planned/batch date should be repaired. Keep both facts until the operator confirms; do not move dates or merge entitlements speculatively.
