# Deals backend API

Only `Litwebs/Levants-server` backend code is changed. No frontend was changed.

## Publication

- `POST /api/admin/deals` with `publicationStatus: "draft"` saves a private draft.
  A draft needs a name; product contents and price can be added later.
- `POST /api/admin/deals/:dealId/publish` requires `promotions.update` and validates
  current product/variant availability, component stock after reservations, price,
  dates and any managed promotional image. It records `publishedAt`/`publishedBy`.
- `POST /api/admin/deals/:dealId/unpublish` makes the deal private again without
  destroying its contents, pricing definition or publication history.
- Publication and activation are separate. Activating a draft never exposes it.
  Scheduled published offers appear only within their dates; archived offers cannot
  be published or edited. Repeated publish/unpublish calls are idempotent.
- List queries support `status=draft` and `status=published` in addition to existing
  filters. Public discovery, detail and checkout all exclude drafts.

Compatibility: old records without publication fields and old create requests that
omit `publicationStatus` retain their existing published behaviour. New draft flows
must send `publicationStatus: "draft"`. There is no migration that silently hides
existing offers. Publication status cannot be changed via the generic PATCH route.

## Pricing

| `pricingMode` | Required definition | Behaviour |
|---|---|---|
| `fixed_price` (default) | `packagePrice` in GBP | Price stays fixed when retail prices change. |
| `fixed_saving` | `savingValue` in GBP | Current product value minus the defined saving. |
| `percentage_saving` | `savingValue` as a percentage greater than 0 and less than 100 | Current product value less that percentage. |

All calculations round effective package prices to pennies. A published offer must
have a positive price and positive effective savings. Values that become invalid
following retail changes disappear publicly and cannot be checked out.

The admin response, public response and checkout calculate from the same live
component prices. `packagePrice` in a savings-mode response is the current effective
price; the stored pricing definition is authoritative. Checkout still requires
`expectedPackagePrice`: a price change requires the customer to refresh rather than
silently charging a different amount. Orders snapshot the effective package price,
pricing mode, saving definition and actual component quantities for history/refunds.

Existing fixed-price clients and baskets need no new fields. Discount codes still
cannot stack with packages; store credit remains supported.

## Refunds and recovery

Package refunds use the discounted order total including the delivery fee. Component
quantities remain normal order lines, so a full restock restores those quantities.
Refund ledger persistence and direct refund restocking now share a transaction;
`metadata.refundRestockedAt` prevents replayed webhooks from restocking twice.

The regression suites cover full/partial card refunds, remaining limits, mixed
package/normal baskets, historical snapshots, expired/failed payment release,
credit-assisted cancellation, duplicate successful payment and compensation after
fully-credit-paid settlement failure. Generic refunds of paid store credit itself
are an existing separate product flow; this change does not add a credit-only
admin refund endpoint.

Tests are grouped in `server/Tests/Deals`; run `npm test -- Tests/Deals` from
`server`, and `npm run test:release` for all backend suites.
