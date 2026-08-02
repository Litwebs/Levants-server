# Customer Portal Subscription Rule Coverage

This document maps the complete product specification in
`docs/Subscription Rules.xlsx` to the static parameter rows exported by
`rule-matrix.js`. It does not claim that a test exists merely because the
workbook's `TESTED` column says `YES - WORKS`.

The primary workbook is binary, so source references use worksheet cells.
Line-addressable implementation-oriented cases can also be found in
`Levants-server/docs/subscription-feature-test-cases.csv:16-91`.

## Coverage totals

| Source | Populated rules | Static rows | Mapping status |
| --- | ---: | ---: | --- |
| `Rules Matrix!A2:L83` | 54 | 54 | Complete |
| `Multi-Day Logic!A2:B11` | 10 invariants | 10 mappings | Complete |
| `Coverage Check!A2:C18` | 17 declarations | Recorded below | Complete |

The 54 rule rows consist of 36 item-edit cases, 6 cancellation cases, 6 pause
cases, and 6 resume cases. `rule-matrix.js` validates the count, uniqueness,
and source order when it is required.

## Test families

| Exported family | Workbook rows | Count | Intended parameterized test family |
| --- | --- | ---: | --- |
| `add-before-funded` | 2, 4, 6, 8, 10, 12 | 6 | Successful add/increase before cut-off |
| `add-before-declined` | 3, 5, 7, 9, 11, 13 | 6 | Payment-atomic add/increase failure before cut-off |
| `remove-before` | 22–27 | 6 | Remove/decrease and refund/credit before cut-off |
| `add-after-funded` | 32, 34, 36, 38, 40, 42 | 6 | Successful add/increase after one delivery locks |
| `add-after-declined` | 33, 35, 37, 39, 41, 43 | 6 | Failed after-cut-off add/increase atomicity; the retry boundary is exercised by the before-cut-off family crossing cut-off |
| `remove-after` | 52–57 | 6 | Remove/decrease without altering or refunding locked deliveries |
| `cancel-before` | 62, 64, 66 | 3 | Cancellation before cut-off |
| `cancel-after` | 63, 65, 67 | 3 | Cancellation after a delivery locks |
| `pause-before` | 72, 76, 80 | 3 | Pause before cut-off |
| `pause-after` | 73, 77, 81 | 3 | Pause after a delivery locks |
| `resume-open` | 74, 78, 82 | 3 | Resume when the next scheduled delivery is still open |
| `resume-locked` | 75, 79, 83 | 3 | Resume when the next scheduled delivery is already locked |

## All 54 workbook rows

### Adding or increasing before cut-off

| Workbook row | Family | Cadence | Action | Funds | Payment and mutation expectation |
| ---: | --- | --- | --- | --- | --- |
| 2 | `add-before-funded` | Weekly single-day | Add item | Sufficient | Charge incremental value immediately, then apply to all open upcoming deliveries. |
| 3 | `add-before-declined` | Weekly single-day | Add item | Insufficient | No successful charge and no subscription or future-order mutation. |
| 4 | `add-before-funded` | Weekly single-day | Increase quantity | Sufficient | Charge incremental value immediately, then apply to all open upcoming deliveries. |
| 5 | `add-before-declined` | Weekly single-day | Increase quantity | Insufficient | No successful charge and no subscription or future-order mutation. |
| 6 | `add-before-funded` | Weekly multi-day | Add item | Sufficient | Evaluate each delivery day; charge and mutate only open deliveries. |
| 7 | `add-before-declined` | Weekly multi-day | Add item | Insufficient | No successful charge or mutation on any delivery day. |
| 8 | `add-before-funded` | Weekly multi-day | Increase quantity | Sufficient | Evaluate each delivery day; charge and mutate only open deliveries. |
| 9 | `add-before-declined` | Weekly multi-day | Increase quantity | Insufficient | No successful charge or mutation on any delivery day. |
| 10 | `add-before-funded` | Fortnightly | Add item | Sufficient | Charge incremental value immediately, then apply to all open upcoming deliveries. |
| 11 | `add-before-declined` | Fortnightly | Add item | Insufficient | No successful charge and no subscription or future-order mutation. |
| 12 | `add-before-funded` | Fortnightly | Increase quantity | Sufficient | Charge incremental value immediately, then apply to all open upcoming deliveries. |
| 13 | `add-before-declined` | Fortnightly | Increase quantity | Insufficient | No successful charge and no subscription or future-order mutation. |

Source: `Rules Matrix!A2:L13`. Related concrete cases:
`Levants-server/docs/subscription-feature-test-cases.csv:22-30` and
`:81-85`.

### Removing or decreasing before cut-off

| Workbook row | Family | Cadence | Action | Payment and mutation expectation |
| ---: | --- | --- | --- | --- |
| 22 | `remove-before` | Weekly single-day | Remove item | Change open upcoming deliveries and immediately refund/credit paid deliveries actually changed. |
| 23 | `remove-before` | Weekly single-day | Decrease quantity | Change open upcoming deliveries and immediately refund/credit paid deliveries actually changed. |
| 24 | `remove-before` | Weekly multi-day | Remove item | Evaluate per day; exclude only deliveries whose cut-off passed. |
| 25 | `remove-before` | Weekly multi-day | Decrease quantity | Evaluate per day; exclude only deliveries whose cut-off passed. |
| 26 | `remove-before` | Fortnightly | Remove item | Change open upcoming deliveries and immediately refund/credit paid deliveries actually changed. |
| 27 | `remove-before` | Fortnightly | Decrease quantity | Change open upcoming deliveries and immediately refund/credit paid deliveries actually changed. |

Source: `Rules Matrix!A22:L27`. Related concrete cases:
`Levants-server/docs/subscription-feature-test-cases.csv:31-39`.

### Adding or increasing after cut-off

| Workbook row | Family | Cadence | Action | Funds | Payment and mutation expectation |
| ---: | --- | --- | --- | --- | --- |
| 32 | `add-after-funded` | Weekly single-day | Add item | Sufficient | Leave locked delivery unchanged and apply from first open delivery. Charge timing conflict C-01 applies; source outcome is blank (C-02). |
| 33 | `add-after-declined` | Weekly single-day | Add item | Insufficient | Apply nothing; on retry, recalculate the first open delivery. |
| 34 | `add-after-funded` | Weekly single-day | Increase quantity | Sufficient | Leave locked delivery unchanged; apply from first open delivery; dominant workbook wording says charge immediately. |
| 35 | `add-after-declined` | Weekly single-day | Increase quantity | Insufficient | Apply nothing; on retry, recalculate the first open delivery. |
| 36 | `add-after-funded` | Weekly multi-day | Add item | Sufficient | Evaluate each day; leave locked day unchanged and apply from first open day. |
| 37 | `add-after-declined` | Weekly multi-day | Add item | Insufficient | Apply nothing to any day; recalculate per-day eligibility on retry. |
| 38 | `add-after-funded` | Weekly multi-day | Increase quantity | Sufficient | Evaluate each day; leave locked day unchanged and apply from first open day. |
| 39 | `add-after-declined` | Weekly multi-day | Increase quantity | Insufficient | Apply nothing to any day; recalculate per-day eligibility on retry. |
| 40 | `add-after-funded` | Fortnightly | Add item | Sufficient | Leave locked delivery unchanged and apply from first open delivery. |
| 41 | `add-after-declined` | Fortnightly | Add item | Insufficient | Apply nothing; on retry, recalculate the first open delivery. |
| 42 | `add-after-funded` | Fortnightly | Increase quantity | Sufficient | Leave locked delivery unchanged and apply from first open delivery. |
| 43 | `add-after-declined` | Fortnightly | Increase quantity | Insufficient | Apply nothing; on retry, recalculate the first open delivery. |

Source: `Rules Matrix!A32:L43`. Related concrete cases:
`Levants-server/docs/subscription-feature-test-cases.csv:25`, `:35`, and
`:81-85`.

### Removing or decreasing after cut-off

| Workbook row | Family | Cadence | Action | Payment and mutation expectation |
| ---: | --- | --- | --- | --- |
| 52 | `remove-after` | Weekly single-day | Remove item | Locked delivery and payment remain unchanged; apply and refund/credit from next open delivery. |
| 53 | `remove-after` | Weekly single-day | Decrease quantity | Locked delivery and payment remain unchanged; apply and refund/credit from next open delivery. |
| 54 | `remove-after` | Weekly multi-day | Remove item | Evaluate per day; never mutate or refund the locked day. |
| 55 | `remove-after` | Weekly multi-day | Decrease quantity | Evaluate per day; never mutate or refund the locked day. |
| 56 | `remove-after` | Fortnightly | Remove item | Locked delivery and payment remain unchanged; apply and refund/credit from next open delivery. |
| 57 | `remove-after` | Fortnightly | Decrease quantity | Locked delivery and payment remain unchanged; apply and refund/credit from next open delivery. |

Source: `Rules Matrix!A52:L57`. Related concrete case:
`Levants-server/docs/subscription-feature-test-cases.csv:39`.

### Cancellation

| Workbook row | Family | Cadence | Timing | Payment and delivery expectation |
| ---: | --- | --- | --- | --- |
| 62 | `cancel-before` | Weekly single-day | Before cut-off | Cancel open upcoming deliveries; immediately refund/credit paid eligible deliveries. |
| 63 | `cancel-after` | Weekly single-day | After cut-off | Locked delivery proceeds; cancellation begins at next eligible point; do not refund locked delivery. |
| 64 | `cancel-before` | Weekly multi-day | Before cut-off | Evaluate each day; cancel and refund/credit only open days. |
| 65 | `cancel-after` | Weekly multi-day | After cut-off | Locked day proceeds; cancellation begins with next open day. |
| 66 | `cancel-before` | Fortnightly | Before cut-off | Cancel open upcoming deliveries; immediately refund/credit paid eligible deliveries. |
| 67 | `cancel-after` | Fortnightly | After cut-off | Locked delivery proceeds; cancellation begins at next eligible point; do not refund locked delivery. |

Source: `Rules Matrix!A62:L67`. Related concrete cases:
`Levants-server/docs/subscription-feature-test-cases.csv:58-65`.

### Pause and resume

| Workbook row | Family | Cadence | Action/timing | Payment and delivery expectation |
| ---: | --- | --- | --- | --- |
| 72 | `pause-before` | Weekly single-day | Pause before cut-off | Skip open deliveries before effective resume; immediately refund/credit paid skipped deliveries. |
| 73 | `pause-after` | Weekly single-day | Pause after cut-off | Locked delivery proceeds; pause and refund/credit start at next open delivery. |
| 74 | `resume-open` | Weekly single-day | Resume while next delivery open | Resume first scheduled open delivery on/after selected date; charge only for additional unpaid delivery value. |
| 75 | `resume-locked` | Weekly single-day | Resume after next cut-off | Skip locked delivery; resume following open delivery; adjust payment only for deliveries actually affected. |
| 76 | `pause-before` | Weekly multi-day | Pause before cut-off | Evaluate per day; skip and refund/credit only open deliveries in pause window. |
| 77 | `pause-after` | Weekly multi-day | Pause after cut-off | Locked day proceeds; pause and refund/credit start at next open day. |
| 78 | `resume-open` | Weekly multi-day | Resume while next delivery open | Resume first scheduled open day on/after selected date; charge only additional unpaid value. |
| 79 | `resume-locked` | Weekly multi-day | Resume after next cut-off | Skip locked day and resume on following open scheduled day. |
| 80 | `pause-before` | Fortnightly | Pause before cut-off | Skip open deliveries before effective resume; immediately refund/credit paid skipped deliveries. |
| 81 | `pause-after` | Fortnightly | Pause after cut-off | Locked delivery proceeds; pause and refund/credit start at next open delivery. |
| 82 | `resume-open` | Fortnightly | Resume while next delivery open | Resume first scheduled open delivery on/after selected date; charge only additional unpaid value. |
| 83 | `resume-locked` | Fortnightly | Resume after next cut-off | Skip locked delivery and resume on following open scheduled delivery. |

Source: `Rules Matrix!A72:K83`. The workbook has no `TESTED` values in
`L72:L83`. Related concrete cases:
`Levants-server/docs/subscription-feature-test-cases.csv:41-57`.

## Ten cross-cutting invariants

| ID | Source | Invariant | Owning test families and required oracle |
| --- | --- | --- | --- |
| INV-01 | `Multi-Day Logic!A2:B2` | Evaluate per delivery, not per subscription. | Every weekly multi-day parameter in all 12 families. Use a mixed fixture with one locked day and one open day and compare both delivery snapshots. |
| INV-02 | `Multi-Day Logic!A3:B3` | A delivery is locked once its cut-off passes; customer edits cannot change it automatically. | All six `*-after`/`resume-locked` families. Assert locked order/delivery items, status, and payment are unchanged. |
| INV-03 | `Multi-Day Logic!A4:B4` | First eligible means the next scheduled delivery whose cut-off has not passed. | `add-after-*`, `remove-after`, `cancel-after`, `pause-after`, and both resume families. Assert the exact effective scheduled date. |
| INV-04 | `Multi-Day Logic!A5:B5` | Successful add/increase applies from first eligible and charges immediately; failure applies nothing. | All four add families. Assert real Stripe PaymentIntent status and amount alongside model atomicity. |
| INV-05 | `Multi-Day Logic!A6:B6` | Remove/decrease changes only eligible deliveries and refunds/credits only paid deliveries actually changed. | `remove-before` and `remove-after`. Assert exact Refund or credit ledger delta and absence of locked-delivery refund. |
| INV-06 | `Multi-Day Logic!A7:B7` | Before cut-off cancellation cancels eligible deliveries; after cut-off the locked delivery proceeds. | `cancel-before` and `cancel-after`, including mixed multi-day lock state. |
| INV-07 | `Multi-Day Logic!A8:B8` | Before cut-off pause skips eligible deliveries; after cut-off the locked delivery proceeds and pause starts next eligible. | `pause-before` and `pause-after`. Assert delivery statuses plus refund/credit scope. |
| INV-08 | `Multi-Day Logic!A9:B9` | Resume on first scheduled delivery on/after selected date whose cut-off remains open. | `resume-open`, `resume-locked`, and pause families. Include selected date between scheduled days. |
| INV-09 | `Multi-Day Logic!A10:B10` | Never apply add/increase before successful payment; recalculate eligibility on retry. | `add-before-declined` fails payment, advances across cut-off, retries with a funded card, and proves newly locked orders remain unchanged; `add-after-declined` independently proves initial after-cut-off failure atomicity. |
| INV-10 | `Multi-Day Logic!A11:B11` | Immediate refund and account credit are equivalent operational choices, but usage must be consistent. | All remove/cancel/pause families explicitly select the card-refund policy, require the exact Stripe Refund total, and require zero store credit; webhook integrity separately checks local refund linkage. |

The exact cut-off boundary is made concrete in the companion cases:
`now === cutoffAt` is after cut-off
(`Levants-server/docs/subscription-feature-test-cases.csv:16`), with adjacent
before/after cases at lines 17–18.

## Required E2E observables

Each test family should assert every applicable surface, not just the portal
toast:

- Portal state and messaging, including the effective delivery date and any
  locked-delivery explanation.
- Live subscription model versus pending/deferred state.
- Every affected delivery/order snapshot, with an explicit negative assertion
  for locked deliveries.
- Real Stripe test-mode PaymentIntent, Refund, invoice, and subscription state,
  including exact amount and currency.
- Absence of a successful payment or mutation when funds are insufficient.
- Recalculated eligibility when a retry crosses a delivery cut-off.
- Continued weekly single-day, weekly multi-day, or fortnightly cadence after
  the operation.
- Both resume payment branches: no new charge when delivery value remains paid,
  and an immediate real Stripe charge when the prior delivery funding has been
  fully refunded.

## Specification conflicts and unresolved policy

### C-01: after-cut-off charge timing

`Rules Matrix!I32:I43` says “Next invoice charge for affected future
deliveries only.” Successful outcomes in rows 34, 36, 38, 40, and 42 say
“charge immediately,” `K32:K43` says not to wait for the next billing period,
and `Multi-Day Logic!B5` also requires immediate charge. The normalized matrix
uses immediate successful payment before mutation, while preserving the
conflicting source text in `paymentExpectation.workbook`.

### C-02: missing row 32 outcome

`Rules Matrix!J32` is blank. The normalized outcome follows the equivalent
successful rows and `Multi-Day Logic!B5`; the exported row retains
`workbookExpectedOutcome: null` and carries the conflict ID.

### C-03: refund versus account credit

`Coverage Check!A18:C18` calls this a policy decision. Tests must either use a
known configured default or run explicit refund and credit variants. They
must not require both for one operation. This suite deliberately selects card
refund for the 54-row matrix and fails if the application silently substitutes
or mixes store credit.

### C-04: pause resume-date inclusivity

Pause scope says “until” or “through” the resume date, while outcome text says
resume on the first scheduled delivery on/after that date. The latter makes a
scheduled delivery on the selected date a resumed delivery, not a skipped
delivery. Keep this recorded until product policy confirms the boundary.

### C-05: amount cardinality is underspecified

“Affected deliveries” does not define how many already-paid deliveries are
included in an immediate delta or refund. E2E amounts should be calculated
from deliberately created paid-delivery fixtures, not from an assumption that
all indefinite future deliveries are charged at once.

## Manual and optional exclusions

- `Coverage Check!A15:C15`: support override after cut-off is explicitly
  `NOT AUTOMATED`. Customer-portal tests should prove no automatic override;
  a separate manual/support test is needed only if the business enables one.
- `Coverage Check!A16:C16`: an earlier lock after inventory allocation or
  picking begins is a `POSSIBLE EXTRA`, not a defined rule. Do not invent an
  E2E expectation until an operational lock signal and policy exist.
- The workbook's refund/credit choice is unresolved policy, not a skipped
  behavioral assertion; financial scope and amount remain mandatory.

## Workbook coverage declarations

`Coverage Check!A2:C14` and `A17:C17` declare the matrix coverage for item
changes, payment retry, cancellation, pause, and resume. These declarations
are represented by the 54 parameter rows above. `Coverage Check!A15:C16` and
`A18:C18` are handled as exclusions/policy decisions rather than executable
rows.
