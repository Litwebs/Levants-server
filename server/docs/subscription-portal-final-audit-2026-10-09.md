# Subscription and customer portal final audit — 9 October 2026

**Release verdict: HOLD. The current branch is not approved for production.**

The two earlier audits did not cover every payment recovery and concurrency boundary. This pass reproduced additional unsafe behavior and pushed nine focused fixes. Their presence in the branch is not a production-readiness claim. The 36 backend test failures have been corrected: replacement run #467 passed all 1,073 tests. The final Stripe/browser gate must still complete with the corrected account-envelope client. Several explicitly identified release blockers remain after these changes.

## Exact release under review

- Server repository: Litwebs/Levants-server, PR 21, `feature/subscription-portal-hardening-server`.
- Latest server code/test revision: `b0adf8748421d041b854a3ef67a79d77a16b65b3`.
- Customer portal revision: `4d60a1082dfdea82cc0facd57289cf2d3e8397e5` on `feature/subscription-portal-hardening`.
- Replacement release run: https://github.com/Litwebs/Levants-server/actions/runs/37906183841 (#467). Backend: 133 suites / 1,073 tests passed; client build passed. This run pinned the previous client and cannot validate its subsequent account-envelope correction.
- No merge or deployment was performed.

## Fixes made during this audit

| Defect | Resulting behavior | Focused evidence |
| --- | --- | --- |
| Busy webhook retries depended on a message hidden by the production error middleware | HTTP 503 preserves a stable error code; signed-event retries recognize it and reuse the original event | Error contract unit test and signed webhook fixture retry |
| Schedule, paid order dates, slots and address updates could commit separately | Related local changes share a Mongo transaction; failure leaves the original schedule available for retry | Four database fault boundaries and a pre-existing target slot collision |
| Paid add-ons on unlinked slots could disappear during pause, cancellation or day removal | Durable, exact-owner settlement records the refund or credit before removal; conflicting edits remain blocked | Settlement unit cases and six action/method transaction-failure cases |
| Background resume, cancellation, slot generation and price repair could act on stale candidate reads | Jobs acquire the shared lifecycle lock and reload the subscription; same request ID cannot reenter a live worker lease | Held lock, extended pause, busy price and stale candidate cases |
| A lost item-decrease refund response could fall back to store credit | Freeze the original refund parameters and checkpoint its result; ambiguous or pending refunds never issue replacement credit | Lost provider response, pending result and local-write failure cases |
| Subscription creation could race card changes or get a new payment identity after refresh | Creation holds the customer card lease and rejects conflicting unfinished creation; client attempts persist by account before sending payment | Two database interleavings, five client creation retry cases, TypeScript check |
| HTTP conflict mapping removed data required by the portal retry logic | Busy, stale and idempotency conflict responses preserve structured data with HTTP 409 | Three response contract cases |
| Resume treated any returned PaymentIntent as successful and had no durable payment/activation checkpoint | Save a resume payment plan before charging, verify owner/currency/exact amount/succeeded status, preserve a paid ledger, and commit local activation and order allocation together | Thirteen payment recovery unit cases; database processing/lost-response/local-write cases; stronger Stripe ledger/allocation assertions |
| An old invoice replay could fund a newly added day from today's plan | Freeze invoice delivery entitlements and reserved order IDs before the first order; repair the original identity after date/item/cadence edits; block edits while fulfillment is incomplete | Replay, moved-order, amount-mismatch unit cases; database schedule replay and interrupted multi-day recovery |

Resume no longer charges an unrelated historical refund to fund a new future slot. Such a slot is funded by its own recurring invoice. The real-Stripe resume fixture now creates an actual backing delivery order when it is testing refund restoration.

Old invoices without a frozen plan are handled conservatively: repair known order identities and flag `legacyReviewRequired`. This prevents inference of additional paid days from the current schedule. It cannot prove the completeness of historical fulfillment where the original entitlement was never saved.

## Why the release run failed

Run #466: https://github.com/Litwebs/Levants-server/actions/runs/37905034828

- 3 suites failed, 130 passed; 36 tests failed, 1,037 passed; 1,073 total.
- Three new resume API tests used a prefixed operation ID instead of the UUID required by the route. They failed validation before reaching payment recovery.
- Those tests changed default Stripe mock behavior without restoring it. The responses and refund history leaked into 23 later scenarios.
- Ten tests in two invoice suites failed shared database setup because their mocked fulfillment model omitted `init()`.

Commit `b0adf8748421d041b854a3ef67a79d77a16b65b3` uses valid UUIDs, resets provider implementations and one-off outcomes per scenario, and gives the invoice model mocks the shared setup contract. Production validation and payment safeguards were not relaxed.

## Browser gate corrections

The superseded browser run exposed a creation bug in the new account-scoped retry wrapper: the server returns `data.customer._id`, while the wrapper read `data._id`. Client commit `4d60a1082dfdea82cc0facd57289cf2d3e8397e5` corrects the API type and lookup. Two tests now invoke the actual creation API wrapper with the real profile envelope and check that a missing account cannot start payment. The previous helper-only tests did not catch this API wiring defect.

Automatic resume may legitimately skip a candidate while a signed webhook holds the lifecycle lease. The E2E control hook now reports that exact busy error so the harness can retry the same subscription. It does not retry ordinary declines or ineligible pauses, and it does not turn a bounded final busy result into success. Both cases have focused harness regressions.

## Verification and its limits

- Current isolated subscription unit run: **27 suites, 232 tests passed**. This excludes database setup and is not a substitute for integration tests.
- Client retry tests: **16 passed**; client TypeScript checks passed during this audit.
- Before the resume/invoice additions, server run #464 passed **131 suites / 1,052 backend tests**, and the client build passed. Its E2E run was superseded; this is not a green gate for the latest revision.
- The last fully green combined gate supplied from the previous pass was #449: **985 backend tests and 103 Stripe/browser tests**, on older commits. It cannot validate today's additions.
- Local Mongo replica-set execution is unavailable in this workspace. Database regressions are checked in CI. Local Vite's native dependency also prevents a reliable build here; the CI build is the build evidence.
- Production database state, live Stripe endpoint configuration, production worker behavior and alert delivery were not exercised. No live financial operation was used for this audit.

## Remaining release blockers

### 1. Expired worker leases are not fully fenced

Evidence: `subscriptionLifecycleLock.service.js`, `subscriptionMutation.service.js`, and writes in the subscription services.

Heartbeats normally prevent takeover and jobs now share the lock. However, renewal failures are swallowed, a lease can be reclaimed after two minutes, and not every following local write conditions its commit on continued ownership. A paused or partitioned worker may resume after another worker has claimed the lease.

Required: a durable ownership/fencing check in the same transaction as every affected local commit, plus guards on provider commands. Test worker A stopping beyond expiry, B claiming and completing, then A resuming. A must not overwrite B or settle a different operation. Include portal, webhook, background job and creation/card paths.

### 2. Paid but unfulfillable and aged operations lack a complete operator recovery path

Evidence: add-on dispatch recovery, `subscriptionAddOnPayment.service.js`, item-increase snapshots, creation snapshots, and `docs/payment-method-recovery.md`.

Fail-closed guards protect against a second ambiguous charge, but they can leave customers blocked. A successful add-on payment whose original delivery closed before attachment is not solved by settlement of an already-attached add-on. Aged card commands, creation or purchase attempts and paid changes with a stale baseline still need explicit reconciliation.

Required: discover the exact saved operation and provider outcome, safely complete the original fulfillment or refund it, commit local evidence with an audit trail, and demonstrate an idempotent second repair. Add detection and an operator alert. Never erase an operation merely to unblock the UI.

### 3. Subscription inventory accounting is incomplete

Evidence: add-on purchase reads `stockQuantity - reservedQuantity`; fulfillment appends items/payment records without an atomic variant reservation or decrement. Invoice-generated paid subscription orders bypass the ordinary pending-order stock finalization path.

The check can admit two customers against the last available unit. This is code-reviewed; a database-backed two-customer race and an end-to-end stock conservation test have not been established in this pass.

Required: establish the subscription inventory policy, implement the atomic reservation/consumption and release boundaries consistently, and test last-unit competition, payment failure, fulfillment retry, pause/refund, and dispatch. Do not claim ordinary-order stock tests cover these direct subscription paths.

### 4. History and legacy recovery remain incomplete

Evidence: `ReconcileRecentPaidSubscriptionInvoices` selects active subscriptions and the first 100 invoices. It can miss recovery for a payment-failure pause or records beyond that page. New resume refund lookups paginate, but invoice recovery and the integrity audit need equivalent coverage.

Known legacy invoice orders can be repaired without adding new entitlements, but their complete historical plan cannot be inferred safely. Item-decrease refunds currently select one primary backing intent; a decrease exceeding its remaining capture after a paid increase safely stops rather than allocating the refund across every backing payment.

Required: paginate histories with cursor progress checks, recover eligible payment-failure pauses, identify incomplete/legacy plans and complete a controlled pre-release reconciliation. Add a multi-intent decrease path with durable split settlement before claiming all decreases are supported.

### 5. Final validation and production preflight

The replacement backend run, Stripe/browser run and combined gate must finish on the exact server and portal revisions. All new failure-boundary cases must pass in that run. Then run the integrity audit against production in read-only mode, review every unresolved paid operation and legacy record, and verify required indexes and enabled signed webhook events before release.

## Tests still needed

| Area | Missing proof |
| --- | --- |
| Lease takeover | Old worker cannot commit after a new owner claims the lease |
| Paid closed target | Supported repair/refund succeeds once and its second invocation moves no money |
| Aged operations | Creation, card, add-on and item-change recovery drills with exact provider outcomes |
| Inventory | Two customers compete for the last unit; reservations and consumption remain conserved through retries and refunds |
| Long history | More than 100 invoices/refunds and payment-failure paused recovery |
| Split decrease | A paid increase on another intent can be reduced and refunded without abandoning the remainder or creating credit |
| Missing/out-of-order invoice plan | Safely identify a delayed unplanned invoice's original billing entitlements; no inference from an unrelated current delivery cursor |
| Production state | Read-only data integrity/preflight report and actionable alerts for every unresolved financial operation |

**A green replacement CI run will close the validation regression, not these outstanding release blockers. Production sign-off remains withheld until the blockers and their tests are resolved.**
