# Deals regression suites

These suites use the existing Jest/Supertest setup, isolated MongoDB replica set,
seeded roles and business information, and mocked Stripe/email provider boundary.
No test reads or writes the production database.

| Concern | Suite |
| Draft, publication, legacy compatibility and permission boundaries | `deals.publication.e2e.test.js` |
| Defined savings arithmetic and rounding | `deals.pricing.unit.test.js` |
| Live savings modes through preview and checkout | `deals.savings-pricing.e2e.test.js` |
| Package refunds, historical snapshots and payment recovery | `deals.refunds-recovery.e2e.test.js` |
| Store-credit compensation on failed settlement | `deals.credit-compensation.e2e.test.js` |
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

The `Deals regression` Actions workflow exposes a dedicated Deals API check and admin release checks on pushes to
`feature/deals`. Broader backend code or test changes also run all backend
regressions; manual runs always run the full suite. Deals-test-only changes use the
dedicated API job, and narrowly scoped analytics changes use the complete analytics
regression job. The workflow does not deploy the branch.
