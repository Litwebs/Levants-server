# Deals integration on UAT

UAT baseline: `f916abdfaee697b3deb90e329f765854174c1d97`.

Existing UAT workflows, scripts, package files, shared test setup, order models, analytics, subscription and delivery implementations remain unchanged. A separate deals regression workflow adds verification without replacing the UAT suites.

## Shared application integration

Only seven existing application files change for deals: app route mounting, database deal indexes, public checkout controller and validator, image reference tracking, public order pricing and deal refund delegation. Ordinary orders retain the existing UAT paths. Catalog search, authentication guards and refund transaction handling for deals use dedicated new modules.

The UAT portal manifest pins the tested customer storefront commit `41d3b17b67b7b1621bdb43081b4330cb93b6d923` so the server release includes the Deals UI.

## Verification

- Backend: **1,571 tests across 183 suites**, including all 1,362 existing UAT tests across 165 suites and 209 deals tests across 18 suites. [Passing backend job](https://github.com/Litwebs/Levants-server/actions/runs/38311787355/job/115019000981).
- Storefront: 28 unit tests, type checking, lint, production build and 20 browser checks. [Passing client workflow](https://github.com/Litwebs/Levants-client/actions/runs/38312744667).
- Actual storefront / Express API / MongoDB integration: four passing checkout cases covering card payment, partial credit, full credit and stale-price refresh. Assertions cover package prices, underlying quantities, stock, credit and payment replay. [Passing integration job](https://github.com/Litwebs/Levants-server/actions/runs/38313840900/job/115025656690).
- Existing client UAT/subscription Node tests: 29 passing tests.

Integration tests replace external Stripe, geocoding, mail and site-status transports. They do not establish real Stripe payment or deployed UAT readiness.

The full backend run tested the final application and regular test code. Subsequent changes were limited to the integration harness, verification workflow, documentation and portal version pin.
