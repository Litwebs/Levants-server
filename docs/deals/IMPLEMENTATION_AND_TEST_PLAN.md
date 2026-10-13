# Deals & Product Packages: implementation audit and regression plan

Audit date: 12 October 2026.
Server/admin target: `Litwebs/Levants-server`, `feature/deals`.
Latest UAT merged: `568415295a623b3acb1b91e56ef2ed6d61e8f305`.
Merge commit: `f75837f6e859eb4066389ae96d6e9a6773890432`.
Customer storefront inspected separately at `Litwebs/Levants-client`,
`feat/customer-deals`, `120fc6e6257b8039ed1fc60eef437a44ee8a6b96`.
The storefront UAT branch (`0cc2e7e855d1385fcecfe717eb397f6fe270841d`)
does not contain the customer deals implementation. It was not modified.

## Requirement status

| Requirement | Status and evidence |
|---|---|
| Create and edit packages | Implemented in admin routes/services and a three-step admin builder, with dedicated edit routes. |
| Publish | Saving an active deal makes it public within its dates. There is no separate persisted draft/published state or publish endpoint. “Publish” in the builder is a save step. |
| Activate/deactivate | Backend supports update/reactivation and deactivation. The current admin management page has no explicit activation/deactivation action; the edit form has the Active toggle. |
| Archive | Backend supports terminal, idempotent archival and forbids edits afterward. The current admin UI exposes no archive button, despite an API wrapper. |
| Products, variants and quantities | Implemented with catalog search/browse/filtering, up to 30 components, positive integer quantities, duplicate-variant rejection and active product/variant checks. |
| Names, descriptions, promotional images | Implemented; image content/type/size checks, managed file references, replacement cleanup and preview. |
| Fixed package price | Implemented in GBP; must be positive and below current combined retail value. |
| Defined savings | Admin percentage shortcuts convert a chosen percentage into a fixed package price. There is no persisted fixed-saving or percentage-saving pricing mode that recalculates when retail prices change. |
| Dates and Featured flag | Implemented; inclusive start, exclusive end, optional dates, featured sorting/filtering and display order. |
| Price/savings preview and availability | Builder uses integer pennies for preview. Backend recomputes live value/savings and capacity from the limiting component after reservations. Sold-out deals remain visible with zero capacity. The admin management page no longer displays the previous “Review price” warning when savings disappear. |
| Featured deals at top of homepage | Partial on customer branch: `FeaturedDeals` exists and the API prioritises featured deals, but the component fetches the first three general offers without `featured=true`. It appears after the hero, order-type choices and category section, rather than at the top. |
| Dedicated featured section on Deals page | Missing on inspected customer branch; it has one paginated grid sorted by the API, without a separate featured section. |
| Cards, details and one-click basket | Implemented on the separate customer branch: names, images, contents, original value, price, savings, details and package basket entries. Not present on storefront UAT. |
| Pricing, checkout, inventory and fulfilment | Backend validates claims and optional content fingerprints, rechecks live prices/availability/dates, expands component quantities, stores immutable price/name snapshots and applies package savings. Guest/signed-in checkout and store credit are supported; discount codes cannot stack with deals. Orders retain normal product lines for fulfilment. |

## Tests added in this change

Existing suites are retained. Additional suites cover:

- Admin partial edits, recalculated multi-product savings/capacity, reactivation,
  omitted-field preservation, date clearing, missing records, status filters,
  regex-safe search, sorting/pagination and unavailable component diagnostics.
- Public mixed-product availability, reservations, exact schedule boundaries,
  invalid components/prices filtered before pagination, live retail changes,
  and variant-to-product image fallback.
- Mixed-product checkout, two offers sharing a variant, unchanged package price
  after retail increases, no-saving rejection, order-independent fingerprints,
  Stripe creation failure rollback, settlement and component reservation release.
- HTTP update schema rejection with unchanged persisted records and malformed IDs.
- Oversized/type-mismatched image rejection, archived/non-image file references,
  managed image reuse, image clearing, failed replacement persistence, and
  best-effort orphan cleanup.
- Schema boundaries/defaulting for create/update/list/catalog.
- Admin price-preview maths, pennies, empty totals, independent drafts, stock and
  image mapping; existing component tests updated to the current three-step builder
  and dedicated edit route, preserving save failure/retry and duplicate-click checks.

See `server/Tests/Deals/README.md` for suite ownership and commands.

## Suggested next implementation/test plan

1. Decide whether inactive deals are sufficient as drafts, or implement an explicit
   draft/published lifecycle. Test draft privacy, publication validation, scheduling,
   deactivation/reactivation, archival and admin actions through the actual UI.
2. Implement persistent saving modes if required: package price, fixed saving,
   percentage saving. Test penny rounding, retail price changes, invalid/non-positive
   effective prices, admin preview and checkout agreement for every mode.
3. Finish merchandising: featured-only homepage section in the requested position,
   separate featured Deals-page section, all-active list without unintended duplicates,
   sold-out states, loading/error/retry, desktop/mobile and keyboard interaction.
4. Select the customer branch to pair with `feature/deals`, merge current storefront
   UAT into it, and pin its tested commit for deals browser CI. The existing branch-name
   resolver otherwise falls back to main because the storefront has no `feature/deals`.
5. Run real Stripe/browser tests with that paired version: guest and signed-in card
   checkout, full/partial credit, duplicate/out-of-order signed webhooks and browser
   reconciliation. Existing Playwright tests require refresh for current builder labels
   and actions before using them as proof of current UI behavior.
6. Add package-specific refund/payment reporting regressions: full/partial refund,
   discount allocation across components, delivery fees, mixed deal/normal baskets,
   cancelled/expired checkout recovery, credit restoration and historical order display.
7. Add remaining component/image failure and concurrency edges: pixel-limit handling,
   upload followed by failed persistence,
   optimistic edit conflicts, simultaneous archive/update and deletion after carting.
8. Before release, smoke-test the deployed pair: image provider, email, Stripe event
   configuration, index creation with autoIndex disabled and fulfilment documents.

## Validation

Final tested code commit: `ceb209f31a33dfdbcff8668b7d042151394544d0`.
Green verification run: https://github.com/Litwebs/Levants-server/actions/runs/38269859659

| Check | Result |
|---|---|
| Deals backend API/service/database suites | 142 tests passed across 11 suites, including 79 additional backend cases. |
| Admin Vitest suites | 20 tests passed across three suites: 18 deals tests (including 10 new preview-maths cases) and two modal regressions. |
| Admin release checks | Typechecking, production build and lint passed; lint has 0 errors and 335 legacy warnings. Existing map/CSP, analytics and 12 subscription-settings checks also passed. |
| Analytics after UAT integration fixes | All 196 tests passed across 60 suites. An additional regression preserves separate sale/refund event dates for net subscription settlements. |
| Initial full backend merge run | 238 suites passed; one analytics suite had five failures, out of 239 suites / 1,700 tests. The affected suite and all other analytics suites passed after the fixes below. |
| Browser / real Stripe | Not run for this paired feature: customer branch selection and outdated admin browser selectors/actions still require work. |

The full merge run exposed financial differences between UAT and the newer
feature-branch analytics. The merge follow-up restores UAT's subscription net
settlement semantics, deduplicates successful refund ledger entries, handles
legacy currency defaults using the order's currency, and preserves the newer
sale/refund event-date reporting. All analytics suites were rerun after the final
fix; the unrelated backend suites passed in the earlier full run. A complete
full-backend run was not repeated on the final currency-only revision.

The change adds 89 deals test cases (79 backend plus 10 admin preview cases),
refreshes the eight existing admin component scenarios, and adds one analytics
merge regression. Existing deals tests remain in place.

Local MongoDB 8 aborted in CPU discovery and MongoDB 7 aborted in partition-cache
initialization before database assertions ran. The database-backed pass counts
above are from GitHub-hosted runners using the real isolated test replica set.

`Deals regression` exposes dedicated Deals API, analytics and admin checks.
Broader backend changes and manual runs also execute the full backend suite;
deals-test-only or narrowly scoped analytics changes use their complete dedicated
suites. No run deploys this branch or contacts live Stripe/email.
