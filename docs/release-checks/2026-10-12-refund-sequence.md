# UAT refund sequence — 12 October 2026

## Scope

Fixture `SUB-20261011-CWIALF` (`6acc0b318c0f4eef2fa9b5a6`).
UAT only. Neither main branch nor production was changed.

## Completed manual verification

| Step | Result |
| --- | --- |
| Baseline | Sunday1/Wednesday1; £26 prepaid, including £2 delivery fees |
| Increase Sunday1→2 | £12 charged; Wednesday unchanged |
| Reverse Sunday2→1 to card | £12 refunded; £26 cycle restored |
| One-time Wednesday add-on | £12 charged; Wednesday order £25; recurring plan unchanged |
| Pause until 19 October | 14/18 October slots cancelled; Wednesday refunded £13 + £12; Sunday further refunded £1 + £12 |
| Resume | Active; next outstanding date 21 October; refunded slots stayed cancelled |
| Cancel | Cancelled; all five displayed future slots cancelled; editing/actions unavailable |
| Customer/admin payment history | Each fixture order £25 collected, £25 card refunded, £0 remaining |
| Store credit | £0 balance; empty history |

Sunday order `ORD-20261011-LWRXBW`: successful refunds £12 + £1 + £12 = £25.
Wednesday order `ORD-20261011-0TLZMU`: successful refunds £13 + £12 = £25.

## Independent Stripe sandbox reconciliation

The configured UAT provider checker used read-only Stripe requests with the deployed UAT sandbox credentials.
It confirmed exactly three successful payments: initial £26, modification £12, add-on £12.
All five refunds succeeded. PaymentIntent and charge refund totals agree:
**£50 collected / £50 card refunded / £0 retained**.
The remote Stripe subscription is `canceled`.

The earlier standalone CI-key diagnostic returned `resource_missing` because that key could not access
the fixture's sandbox scope. It was superseded by the successful configured UAT audit and is not
evidence of a refund failure. Its unused diagnostic branch can be removed.

## Verified corrections

- Customer detail selects the outstanding delivery matching the authoritative server date.
  Cancelled/refunded add-ons remain in history without appearing in the next-delivery total.
  Explicit null does not fall back to a stale billing date.
- Customer and admin cancelled list/detail views show "None scheduled".
- Multi-day customer cards show "Products per cycle"; single-day cards show "Products per delivery".
  Delivery fees are identified separately. The fixture's £24 products plus two £1 fees total £26.
- Existing refund allocation and payment reporting changes are present in UAT.

## Exact validated revisions

| Repository | Review revision | UAT application revision |
| --- | --- | --- |
| Levants-server | `64fda9f56079470efc7765a98a6a340eb92c9df4` | `46be972041a64c31736729827bd96c577441c2c1` |
| Levants-client | `70115f633fbb75bcc0fea5f112b441e2b72d7607` | `cb5bf9a7c77f386db2a4049d49f85053ee1e347d` |

The server UAT revision pins the exact client UAT revision.
A later documentation-only commit does not change this validated application pair.

- [Native client CI](https://github.com/Litwebs/Levants-client/actions/runs/38211580355):
  lint, typecheck, production build, 21 tests passed.
- [Paired review release CI](https://github.com/Litwebs/Levants-server/actions/runs/38211884154):
  160 backend suites / 1,310 tests, 109 real Stripe/browser tests, admin lint/build and release gate passed.
- [UAT client deployment](https://github.com/Litwebs/Levants-client/actions/runs/38211600914): passed.
- [UAT server gated pipeline](https://github.com/Litwebs/Levants-server/actions/runs/38211877820):
  backend/admin verification, 109 real Stripe/browser tests, deployment and all nine configured-provider checks passed.
- Live customer/admin verification passed after deployment.

Provider checks cover sandbox Stripe and signed/rejected webhook requests, Resend API acceptance,
isolated Cloudinary upload/delete and deletion guard, Google geocode/route, dedicated UAT database
and scheduler lease exclusion, and the exact fixture's refund/cancellation audit.
Resend acceptance does not prove inbox delivery; UAT does not prove production integrations.

## Production release hold

Overall production sign-off remains withheld pending:

- Read-only production data/index integrity and historical entitlement reconciliation.
- Live Stripe webhook configuration and processing evidence.
- Scheduler execution, London/DST handling and restart recovery evidence.
- Actual customer/operator inbox and actionable alert delivery.
- Recoverable backup, staging restore and rollback rehearsal.
- GitHub branch protections.
- Exact eventual production server/customer portal pair, smoke checks and first-cycle monitoring.

Both main branches were unprotected with empty ruleset lists during the final checks.
No protection settings, production data, main refs or admin settings were modified.
