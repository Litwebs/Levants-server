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

## Additional verified display corrections

Server review `437ef5b10f52f23b0f86fd2a890238e972fd1602` corrects the
cancelled next-delivery date in admin list/detail. Live UAT verifies "None scheduled"
in both views, with active dates retained.

Client review `70115f633fbb75bcc0fea5f112b441e2b72d7607` applies the same
authoritative date handling to customer cards. Multi-day card totals are now
labelled "Products per cycle" rather than "Per delivery"; single-day totals are
labelled "Products per delivery". Delivery-fee copy identifies these as product
totals. The fixture's £24 products correspond to a £26 cycle after two £1 fees.
[Client CI](https://github.com/Litwebs/Levants-client/actions/runs/38211580355)
and [UAT deployment](https://github.com/Litwebs/Levants-client/actions/runs/38211600914)
passed; UAT portal SHA is `cb5bf9a7c77f386db2a4049d49f85053ee1e347d`.

[Paired review CI](https://github.com/Litwebs/Levants-server/actions/runs/38209379281)
for the preceding portal revision passed **160 suites / 1,310 backend tests**,
**109 real Stripe/browser tests**, admin lint/build and the release gate.
[Paired UAT verification](https://github.com/Litwebs/Levants-server/actions/runs/38209410019)
passed the same counts, deployed the admin correction and passed all eight existing
configured-provider checks. The final storefront pair is being rechecked after
this checkpoint update.

## Independent sandbox verification checkpoint

The CI sandbox key cannot read this UAT fixture's initial PaymentIntent
(`resource_missing`). The diagnostic workflow used only reads and is not evidence
of a refund failure. A read-only fixture audit is now attached to the configured
UAT provider checker, using the deployed sandbox credentials. It requires all
three payments and all successful refunds to balance to £50 collected / £50
returned / £0 remaining, and verifies remote cancellation. Its final pipeline
result is pending at this checkpoint.

Read-only repository checks found both main branches unprotected and both ruleset
lists empty. No repository protection settings were changed. No admin settings
were modified.
