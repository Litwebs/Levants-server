# Deals backend regression suites

Run `npm test -- --testPathPatterns=Tests/Deals` from `server`.

Run `npm run test:deals:baskets` from `server` for the focused basket checkout
matrix and abuse checks. The matrix verifies the server's saved prices, deal
claims and inventory reservations for the customer combinations. Automatic
offer selection and the retry/review UI are client behaviors covered by the
client's `test:deals:baskets` runner; the backend accepts and validates the
resulting claims rather than selecting offers itself.

Run `npm run test:e2e:deals:baskets` from `server` for Playwright browser
coverage. It creates the mixed package in the admin UI, opens the storefront
checkout in Chromium for the basket combinations, submits each order, and
checks the persisted price and deal claims through the isolated E2E stack. It
also covers mobile and desktop quantity changes, mixed-package removal,
reload, offer expiry and deactivation, stale-price/content review, retry after
a failed offer check, discount stacking, account credit, inventory changes
after preview, and the documented overlapping-offer limitation. The stack
uses isolated MongoDB and Stripe test mode; orders stop at Stripe Checkout
unless a separate payment test explicitly completes a card payment.

- Administration: lifecycle, management, publication, permissions, token purpose, update validation, images and indexes.
- Merchandising: public catalog, promotional windows, featured ordering and stock availability.
- Pricing: fixed price, fixed savings, percentage savings and request validation.
- Checkout: package quantities, mixed baskets, stale/tampered claims, concurrent inventory, credit and payment recovery.
- Refunds: discounted totals, credit-assisted card capture limits, cumulative partial refunds, component inventory and replay handling.

`helpers/testApp.js` adds deals routes around the existing UAT test app. `helpers/setup.js` initializes only deal indexes. Existing UAT test setup and workflows are unchanged.
