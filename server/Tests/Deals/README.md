# Deals backend regression suites

Run `npm test -- --testPathPatterns=Tests/Deals` from `server`.

Run `npm run test:deals:full` from `server` for the complete independent
backend/admin check: deals API regressions, admin type checking and component
tests, then Playwright against a fresh admin build. It needs the dependencies
in both `server` and this repo's `client`, Playwright Chromium, and the existing
Stripe test-mode configuration used by the isolated E2E stack.

Run `npm run test:deals:baskets` from `server` for the focused basket checkout
matrix and abuse checks. The matrix verifies the server's saved prices, deal
claims and inventory reservations for the customer combinations. Automatic
offer selection and the retry/review UI are client behaviors covered by the
client's `test:deals:baskets` runner; the backend accepts and validates the
resulting claims rather than selecting offers itself.

Run `npm run test:e2e:deals:baskets` from `server` for Playwright browser
coverage of the admin application and backend order API. It starts only
services and code in `Levants-server`, creates a mixed deal through the admin
UI, validates the 16 basket payloads through the API, and verifies an admin
price edit rejects a stale checkout claim. Browser tests also cover saving
incomplete drafts, rejecting incomplete publication, all three pricing modes,
image upload, descriptions, Featured status, mobile/desktop preview, persistent
edits, publish/unpublish, activation, archive, schedules, invalid savings, and
stock loss before publication. It uses isolated MongoDB and Stripe test mode.
No customer storefront checkout or sibling repository is needed. Add
`-- --headed` to watch Chromium.

The Playwright configuration builds the current admin source before serving it,
so a previously built bundle cannot hide a regression.

The standalone customer storefront command is `npm run test:deals:baskets`
from `Levants-client`; its API is mocked inside Playwright. Run both repo
commands when checking the shared basket contract.

| Feature requirement | Backend/admin coverage |
| --- | --- |
| Package creation and lifecycle | `e2e/deals/deals-admin.spec.js`, publication/lifecycle/permissions API tests |
| Product variants, quantities and stock | Admin picker browser flows, catalog/validation tests, publication stock-race test |
| Images and description | Admin upload and persisted-description browser checks, image validation API tests |
| Fixed price and defined savings | All pricing modes in admin Playwright, penny rounding unit tests, live-retail pricing API tests |
| Dates and Featured visibility | Schedule browser checks, public catalog lifecycle/filter tests |
| Inventory and fulfilment | Checkout package tests verify underlying quantities, reservations and settlement; recovery tests verify rollback and replay |

- Administration: lifecycle, management, publication, permissions, token purpose, update validation, images and indexes.
- Merchandising: public catalog, promotional windows, featured ordering and stock availability.
- Pricing: fixed price, fixed savings, percentage savings and request validation.
- Checkout: package quantities, mixed baskets, stale/tampered claims, concurrent inventory, credit and payment recovery.
- Refunds: discounted totals, credit-assisted card capture limits, cumulative partial refunds, component inventory and replay handling.

`helpers/testApp.js` adds deals routes around the existing UAT test app. `helpers/setup.js` initializes only deal indexes. Existing UAT test setup and workflows are unchanged.
