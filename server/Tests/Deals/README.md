# Deals backend regression suites

Run `npm test -- --testPathPatterns=Tests/Deals` from `server`.

- Administration: lifecycle, management, publication, permissions, token purpose, update validation, images and indexes.
- Merchandising: public catalog, promotional windows, featured ordering and stock availability.
- Pricing: fixed price, fixed savings, percentage savings and request validation.
- Checkout: package quantities, mixed baskets, stale/tampered claims, concurrent inventory, credit and payment recovery.
- Refunds: discounted totals, credit-assisted card capture limits, cumulative partial refunds, component inventory and replay handling.

`helpers/testApp.js` adds deals routes around the existing UAT test app. `helpers/setup.js` initializes only deal indexes. Existing UAT test setup and workflows are unchanged.
