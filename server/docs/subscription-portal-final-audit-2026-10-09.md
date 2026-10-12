# Subscription and customer portal final audit — 9 October 2026

**Release verdict: verification pending; production sign-off remains withheld.**

This pass implements the code blockers identified by the prior audits and adds failure-boundary regressions. It does not promise faultless operation. A combined green gate on the final server and pinned portal revisions, followed by live read-only preflight and operational checks, is required.

The work is on server PR 21 (`feature/subscription-portal-hardening-server`) and portal revision `4d60a1082dfdea82cc0facd57289cf2d3e8397e5`. No merge or deployment was performed. Consult the latest PR Actions run for the exact server SHA; older green runs do not validate subsequent code changes.

## Findings resolved

| Area | Result and regression evidence |
| --- | --- |
| Worker takeover | Writes touch the owned, unexpired lease in the same transaction; stale portal, webhook, lifecycle, creation and card workers cannot commit or send fresh provider commands. Real MongoDB takeover, expiry, snapshot and rollback cases supplement Mongoose middleware tests. |
| Payment recovery | Original requests, payment identities and provider checkpoints survive response loss and local-write failure. Aged histories paginate with cursor checks. Declined creation retries save a fresh attempt and use the current default card; unpaid stock is released. Add-on/increase success requires the saved customer, currency and exact capture. |
| Closed paid add-on target | Recover the original payment, then refund once if its target is no longer editable. Local evidence commits before the operation completes; repeating recovery cannot issue replacement money. |
| Subscription stock | Creation, recurring invoices, increases, add-ons and refund restoration reserve and consume atomically. Normal-order reservation repair retains subscription holds. Tests cover last-unit competition, failed transactions, duplicate quantities, partial multi-day consumption, decline/retry, removal/refund conservation and repeated item transitions. |
| Split decreases | Freeze every per-order/per-intent refund step before moving money, budget captured balances globally, checkpoint each refund and preserve exact local allocations. Tests exercise multiple intents, response loss, pending outcomes, conflicting histories and fulfillment failure. |
| Original invoice agreement | Freeze original order IDs, day items, amounts and inventory at draft preparation. Delayed events use that plan. Unknown unallocated paid agreements are refunded once with paused billing, ledger and customer notification; allocated legacy invoices require explicit review. Draft stock failures stop automatic collection; closed invoices release unpaid holds. |
| Generic admin refunds | Subscription orders cannot use the ordinary single-intent refund endpoint; the API blocks money/stock commands and the admin view directs operators to subscription settlement. Two API regressions cover legacy and allocated partial captures. |
| Dispatch concurrency | Unleased order writes touch the subscription row transactionally and reject unresolved financial recovery. Batch/route state and order dispatch commit together; a rejected order leaves the batch and route unchanged. |
| Operator recovery | Read-only inspection and explicit application of one saved mutation, invoice or card operation use the original request and normal safeguards. Missing legacy request payloads are not guessed. Scheduler detection identifies aged unresolved operations without customer PII. |
| Preflight | Read-only audit counts missing financial indexes, ambiguous/missing webhook configuration, stock drift, unaccounted orders, held drafts, invoice linkage and batch date issues. One selected enabled webhook endpoint must receive all required invoice/subscription/refund events. |
| Earlier portal defects | Atomic schedule/address/slot edits; lifecycle rereads under shared locks; correct transient/busy response contracts; account-scoped retry identities; atomic resume funding/activation; exact paid-order/slot/refund replay. Existing regressions remain in the full release suite. |

## Validation record

The previously reported 36 failures were fixture/setup regressions, corrected without weakening production payment validation. Later integration runs exposed additional real gaps, which were fixed with focused regressions.

- Run #473: all 103 real Stripe/browser checks passed. Its backend had one missing aged-creation mock, subsequently corrected.
- Run #474: client build passed; 1,138 backend tests passed and four new-test failures were identified. The corrections cover a refund-method fixture, missing provider SDK mocks, model registration and test fixture scope. The Stripe/browser lane passed 99 checks; four creation fixtures omitted the newly required operation ID. Those callers are corrected.
- Latest local isolated subscription checks: 35 suites / 290 tests passed including capture-identity, admin-refund and resume-history regressions. Local syntax and whitespace checks passed.
- Run #475 on `c2899f45918c6f9f43367a2fcbd7b79fb8f7a9df`: 143 backend suites / 1,157 tests and the client build passed. Its browser lane was superseded by the final admin-refund and resume-history corrections.
- The next combined run must include every final correction and additional database regression. This document records pending verification, not a green result.

Database integration and real signed-webhook/browser tests run in CI because this workspace cannot run its MongoDB replica-set binary. Client retry checks (16 tests) and TypeScript checks passed locally; CI provides native build evidence. Tests cover the identified recovery/concurrency boundaries; they are not proof of every possible failure or a substitute for production data checks.

## Production checks still required

This workspace has no production MongoDB or Stripe connection configured. No live integrity scan, legacy stock/entitlement review, webhook routing/signing-secret/delivery check, deployed scheduler check or alert-delivery drill has been performed. These are deployment-environment facts that unit tests cannot establish.

Use [the operations runbook](subscription-operations-runbook.md). Run the read-only commands in the intended production environment, review every finding, reconcile legacy records from actual financial and fulfillment evidence, and confirm the required unique indexes, signed events and operational alerts. Historical records lacking original entitlements or stock proof cannot be repaired automatically by assuming today's schedule or inventing inventory consumption. Production sign-off requires those checks and the exact final combined gate to pass.
