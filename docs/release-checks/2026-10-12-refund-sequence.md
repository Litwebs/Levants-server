# UAT refund sequence — 12 October 2026

## Scope

Customer fixture `SUB-20261011-CWIALF` (`6acc0b318c0f4eef2fa9b5a6`).
UAT only; production remained read-only. Neither repository's main branch was changed.

## Manual browser results

| Step | Result |
| --- | --- |
| Baseline | Sunday1/Wednesday1; £26 prepaid, including £2 delivery fees |
| Increase Sunday1→2 | £12 charge confirmed; Wednesday unchanged |
| Reverse Sunday2→1 to card | £12 refund confirmed; £26 cycle restored |
| One-time Wednesday add-on | £12 charged; Wednesday order became £25; recurring plan unchanged |
| Pause until 19 October | 14 and 18 October slots cancelled; Wednesday refunds £13 + £12; Sunday further refunds £1 + £12 |
| Resume | Active; next outstanding date 21 October; refunded slots remained cancelled |
| Cancel | Cancelled; all five displayed upcoming slots cancelled; editing/actions unavailable |
| Payment history | Both fixture orders: £25 collected, £25 card refunded, £0 remaining |
| Store credit | £0 balance, empty history |
| Admin history | Both order settlement summaries agree with customer history |

Sunday order `ORD-20261011-LWRXBW`: successful refunds £12 + £1 + £12 = £25.
Wednesday order `ORD-20261011-0TLZMU`: successful refunds £13 + £12 = £25.
Total collected £26 + £12 + £12 = £50; total successful refunds reported by UAT £50; retained funds £0.

These are application ledger/browser observations. Independent read-only Stripe
object reconciliation for this exact fixture has not been performed in this
session. Do not confuse application-reported Succeeded with a fresh provider audit.

## Finding and remediation

The customer detail snapshot selected `deliveries[0]`, so it continued presenting
a cancelled/refunded add-on delivery as the next delivery after pause/resume/cancel.
Client review `60a2110e26e368eb1ba146731d9544f979a227ce` selects the outstanding
delivery matching the server's authoritative upcoming date; cancelled subscriptions
show no next delivery, and explicit null does not fall back to a stale billing date.
Historical delivery rows remain available.

Five new regressions and all 16 existing retry tests passed locally (21 total).
Typecheck and lint passed. Native client CI run
[38208719064](https://github.com/Litwebs/Levants-client/actions/runs/38208719064)
passed tests, lint, typecheck and production build. Local native Rollup crashed in
this container; the unmodified GitHub runner build passed.

UAT storefront candidate `0920bf3ada97f062a564948fd1639ac55e0e60d4` is being verified
and deployed by the isolated
[UAT pipeline](https://github.com/Litwebs/Levants-client/actions/runs/38209052975).
Live post-deployment verification and fresh paired server/client CI are pending at
this checkpoint.

## Remaining release evidence

Overall production sign-off is withheld. Outstanding evidence includes production
read-only data/index audit and historical entitlement classification, branch
protections, live webhook configuration/processing, scheduler/restart rehearsal,
notification delivery, backup/restore and rollback rehearsal, and verification of
the exact eventual deployed server/customer portal pair.

Admin subscription list/detail still present a next billing/schedule date after
cancellation; this display needs separate review. No admin settings were modified.
