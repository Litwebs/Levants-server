# Subscription production preflight — 12 October 2026

**Historical preflight evidence:** this report records the checks before the six-index application. The indexes were subsequently created and verified in run 38236537775. See [current release status](2026-10-12-release-status.md) for the latest verdict. Neither main branch or production application release was changed.

## Exact revisions

| Target | Revision |
| --- | --- |
| Server main / deployed production | `144badd63cb5263ad8eb89ce4f353816515f0fd4` |
| Customer portal main | `9f74c118b41e13e2cf66d2851c610174ea21f3f3` |
| Server review candidate, PR #21 | `9e2f24ef05a9db447b962be1977177ff2e39684f` |
| Customer portal review candidate | `70115f633fbb75bcc0fea5f112b441e2b72d7607` |
| Fixed UAT server candidate | `b1dbe3b533c5111352325a677c400346a2ea357c` |
| Pinned UAT customer portal | `cb5bf9a7c77f386db2a4049d49f85053ee1e347d` |

The review branches contain the application changes. UAT-specific configuration, credentials, deployment isolation and diagnostic workflows are not production runtime changes. Do not merge the whole UAT branches without reviewing those differences.

## Completed checks

| Check | Result and evidence |
| --- | --- |
| Application release CI | [38222493736](https://github.com/Litwebs/Levants-server/actions/runs/38222493736): 161 backend suites / 1,324 tests, 109 real Stripe/browser tests, admin lint/build and release gate passed. Production deployment was skipped. |
| Initial final UAT pair | [38216609367](https://github.com/Litwebs/Levants-server/actions/runs/38216609367): backend/admin, all 109 Stripe/browser tests, deployment and nine configured-provider checks passed before the additional scheduler/logging fix. |
| Production inventory | [38219426826](https://github.com/Litwebs/Levants-server/actions/runs/38219426826): 29 subscriptions, 128 paid Stripe invoices and 172 local subscription orders scanned; no unlinked paid invoices or duplicate London delivery dates. All eight index key sets had zero duplicate groups. This is scoped evidence, not proof of every historical entitlement. |
| Corrected reservation scan | 38 `productvariants` checked; no reserved-quantity drift or missing variants. The earlier scan against `variants` was incorrect and is not authoritative. |
| Legacy financial linkage | [38220871040](https://github.com/Litwebs/Levants-server/actions/runs/38220871040): all 13 outstanding orders have one matching generated delivery slot, one paid payment row, successful live captures and paid invoices. Per-order payment totals and shared-invoice allocations match in all 13 cases. |
| Webhook log classification | [38221041442](https://github.com/Litwebs/Levants-server/actions/runs/38221041442): all six previously reported webhook-error lines are expected payment-decline / subscription-paused notices. A duplicate-key message nearby does not establish a handler failure. |
| Live webhook routing evidence | [38222888767](https://github.com/Litwebs/Levants-server/actions/runs/38222888767): an access log explicitly configured for the production API contains five recent webhook POSTs, all HTTP 200. 409/503 responses are in another log whose environment attribution remains unproven; they are not confirmed production failures. Existing accepted events do not validate events omitted from the endpoint configuration. |
| Transaction topology | [38226029594](https://github.com/Litwebs/Levants-server/actions/runs/38226029594): production MongoDB 8.0.19, writable replica set, session support and transaction-capable topology. No collections, indexes or documents changed. |
| UAT database backup / restore | [38221958850](https://github.com/Litwebs/Levants-server/actions/runs/38221958850): 31 collections / 161 documents dumped while only the UAT API was stopped, restored into an isolated UAT namespace, and matched by BSON digest, document count and index definitions. UAT restarted and the clone/archive were removed. The later DST step failed; that workflow is not an overall passing rehearsal. |
| Worker-exit lease recovery | Same rehearsal: a replacement worker was excluded before the abandoned 30-second lease expired, acquired it after expiry, and fenced out renewal/deletion by the old owner. Only an isolated UAT namespace was used. |
| UAT application rollback | [38222181875](https://github.com/Litwebs/Levants-server/actions/runs/38222181875): switched to a prior immutable UAT release, verified health, restored the original release and verified health. Production HEAD, process identity and health stayed unchanged. This run identified the DST defect and is not an overall passing rehearsal. |
| Customer inbox delivery | Six emails for `SUB-20261011-CWIALF` verified in the connected inbox: creation, £12 increase, £12 card reversal, pause, resume and cancellation. All contain the exact fixture reference and correct UAT portal link; SPF, DKIM and DMARC passed. No new emails were sent for this read-only check. This does not establish operator alert delivery. |
| Production order-alert inbox delivery | [38226897297](https://github.com/Litwebs/Levants-server/actions/runs/38226897297) correlates two received, authenticated new-order alerts today to paid production orders `ORD-20261012-KA1PM5` and `ORD-20261012-6CW5XE`. This proves the existing order-alert path, not the recovery/scheduler alert destination. |

## New findings fixed in the candidates

1. **DST scheduling:** the installed cron library's direct `0 6 * * *` London next-match calculation returned January 2027 when crossing both 2026 clock transitions. Its runner caps the wait to one day; this can still miss spring's 06:00 London maintenance rather than suspend all execution until January. The candidate uses a fixed UTC 15-minute heartbeat and evaluates the London 06:00 gate on every tick. The real cron library and both transition windows are covered by the new regressions.
2. **Recovery log detail:** the existing logger discarded the structured report object, so affected operation/invoice IDs were missing. The candidate passes a serialized, projected report and checks actual console output for useful identifiers without customer email/request details.

The application release gate passed these fixes. Exact fixed UAT deployment/runtime verification is tracked below.

## Fixed UAT verification

[38222542171](https://github.com/Litwebs/Levants-server/actions/runs/38222542171) initially passed backend/admin/safety checks and 108/109 Stripe/browser tests. One fixture timed out waiting 30 seconds for its signed initial-invoice webhook. Deployment and provider checks were correctly skipped. The successful parallel review lane passed the same matrix. The failure evidence remains attached to the UAT run; its cause has not been independently established.

Only failed/dependent UAT jobs were rerun after the parallel review lane finished. No timeout was increased, no test was removed and no gate was bypassed. **Final retry/deployment result: passed.** Attempt 2 passed all 109 Stripe/browser tests, deployed the immutable fixed UAT release and passed all nine configured-provider checks. The configured sandbox audit again verified 5,000p collected, 5,000p refunded through five successful refunds, zero retained and remote subscription status `canceled`. The first timeout remains recorded; a passing isolated rerun does not establish its root cause.

[38227286164](https://github.com/Litwebs/Levants-server/actions/runs/38227286164) **passed on the exact fixed UAT server**:

- The installed UTC heartbeat advances through the spring and autumn transitions without skipping. Daily maintenance falls at 05:00 UTC on 29/30 March and 06:00 UTC on 25/26 October, matching 06:00 London.
- A synthetic unresolved invoice in an isolated namespace emits its useful identifier through the actual recovery logger, without customer request/email details.
- UAT rolls back to immutable `7129519db3b8b1a3564581ad91a30be22832f482`, whose schemas/business-operation code match; scheduler/logging-only differences are intentionally allowed. It then returns to exact current `b1dbe3b533c5111352325a677c400346a2ea357c`, with healthy background jobs.
- Production HEAD, both actual Node process identities and production health remain unchanged. Process detection uses executable identity because PM2 may change process titles.
- The synthetic database is removed.

The preceding [38225468809](https://github.com/Litwebs/Levants-server/actions/runs/38225468809) stopped at an initial guard before runtime checks. Correcting the probe's process-title assumption and improving safe guard diagnostics did not change application code or weaken the requirement to verify production process identity. The passing run is the authoritative fixed-runtime evidence.

## Production blockers and historical findings

| Area | Remaining requirement |
| --- | --- |
| Financial indexes | Required unique indexes missing on `paymentmethods`, `subscriptionmutations`, `subscriptioninvoicefulfillments`, `subscriptionstockreservations`, `payments`, `storecredittransactions`. No duplicate groups found, but creation is a production write. Reviewed startup code explicitly creates them; it has not run in production. |
| Live Stripe event subscriptions | Enabled live endpoint `https://api.levantsdairy.co.uk/api/webhooks/stripe` lacks `invoice.created`, `invoice.voided`, `invoice.marked_uncollectible`, `refund.created`, `refund.updated`. Preserve existing events when applying an approved correction. No event configuration was changed or historical event replayed. |
| Legacy inventory | 13 paid undelivered orders for 14/18 October lack consumption journals. None has missing item variants, add-on units or a delivery-batch assignment. The deployed legacy subscription webhook has no consumption/journal code, supporting a legacy accounting-gap classification. Physical counts and any separate administrative stock adjustments remain unproven. Never invent consumption proof, blindly restock or re-run paid invoices. |
| Historical batch date | Delivered `ORD-20260816-H9GEWU`: batch London date 19 August; order London date 23 August. Delivered status alone cannot establish the authoritative date. Check original fulfillment/dispatch evidence before repair. |
| Operator alerts | Useful identifiers are fixed in the candidate logs. Delivery to an actionable operator destination remains unverified. Known Promtail/Vector/Filebeat/Fluent Bit/Datadog config paths were absent; a standard rsyslog directory is not evidence of an alert destination. No matching recovery alert was found in the checked inbox. Other destinations have not been ruled out. |
| Actual production backup / recovery | UAT restore proves the exercised mechanism. An actual production database backup, retention/off-host destination and verified restore/rollback plan remain unestablished. Common inspected backup locations did not establish a MongoDB backup. Do not copy production data into UAT or interpret installed dump/restore binaries as restore evidence. |
| Repository release controls | Both main branches remain unprotected; no rulesets were found in the earlier inventory. Require review PRs and successful relevant release checks through a separate administration change. |
| Production deployment | Exact coordinated server/client deployment and production smoke checks can occur only after explicit approval. Current production still runs the older code. |

### Shared-refund exception resolved

The shared invoice behind upcoming `ORD-20261011-UQ85Z5` captured 940p and has a successful 120p refund. The exact Stripe refund ID is recorded against delivered sibling `ORD-20261011-WX0C3D`; the upcoming order has no refund and remains funded. Do not allocate its sibling's refund to it.

## Verdict boundaries

- **Future subscriptions:** application candidate has passed the stated release checks; fixed UAT deployment and runtime evidence also pass. Production approval remains withheld because the listed production prerequisites are incomplete.
- **Existing subscriptions:** the covered invoice/order links and the 13-order financial comparisons pass. Existing inventory journals and one historical date still require reconciliation; all historical records are not certified consistent.
- **Coordinated release:** blocked. No production payment/refund, database/index repair, restart, deployment or main push/merge has been performed.

## Remaining-action follow-up

The [remaining production action plan](2026-10-12-remaining-production-actions.md) records the successful index dry run, explicit MongoDB oplog authorization error 13, absence of an established database backup job/archive, prepared branch-protection payloads, unverified alert forwarding, and the historical order's recorded early delivery. No indexes or historical records were changed. Stripe event changes remain deferred to the owner.
