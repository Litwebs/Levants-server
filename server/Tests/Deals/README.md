# Deals regression suites

These suites use the existing Jest/Supertest setup, isolated MongoDB replica set,
seeded roles and business information, and mocked Stripe/email provider boundary.
No test reads or writes the production database.

| Concern | Suite |
|---|---|
| Admin lifecycle and publication windows | `deals.lifecycle.test.js` |
| Admin edits, filtering, search, sorting and pagination | `deals.admin-management.service.test.js` |
| Public pricing, component availability, dates and images | `deals.public-catalog.service.test.js` |
| Request schema boundaries and defaulting | `deals.validation.unit.test.js` |
| HTTP update rejection and persistence guarantees | `deals.update-validation.e2e.test.js` |
| Admin permissions and authentication | `deals.permissions.e2e.test.js` |
| Image upload, replacement and cleanup | `deals.image.test.js` |
| Corrupt inputs, concurrent creation and catalog picker | `deals.hardening.e2e.test.js` |
| Checkout, stale baskets, store credit and concurrent stock | `deals.checkout.e2e.test.js` |
| Multi-product checkout, shared variants, rollback and settlement | `deals.checkout-packages.e2e.test.js` |
| Production index setup | `deals.indexes.test.js` |

New integration suites share `helpers/dealFactory.js`, which builds a real
multi-product package with unique slugs and component quantities.

Run backend deals: `npm test -- Tests/Deals` from `server`.
Run all backend regressions: `npm run test:release` from `server`.
Run admin UI and preview maths: `npm run test:deals` from `client`.
Run browser scenarios: `npm run test:e2e:deals:ci` from `server` with the matching
customer storefront and existing Stripe test-mode configuration.

The `.e2e.test.js` Jest files test HTTP/service/database integration with mocked
providers. The Playwright `e2e/portal-subscriptions/deals.spec.js` tests browsers
and real Stripe test-mode payments; those are separate verification levels.

The `Deals regression` Actions workflow exposes a dedicated Deals API check alongside all backend regressions and the
admin release checks on pushes to `feature/deals`, without deploying the branch.
