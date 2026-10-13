# Deals browser verification

The browser harness runs the pinned customer storefront against a real Express API and a temporary MongoDB replica set inside GitHub Actions. It does not deploy to UAT or production. Only `feature/deals` receives verification changes.

## Coverage

The ordinary browser/API job exercises card checkout, partial and full credit, stale-price refresh, authenticated admin API lifecycle changes reflected in the storefront, draft/inactive/future/expired/archived visibility, sold-out details, component quantities, repeated package additions and basket persistence after reload.

The separate Stripe job requires a real `STRIPE_TEST_SECRET_KEY` beginning with `sk_test_`. It exercises both card-only and £5-credit-assisted payments using hosted Stripe Checkout with the 4242 test card, checks the real session discount and charged amount, submits the real paid session through the signed HTTP webhook handler twice, and verifies a real test-mode refund and component restocking. Payment success uses a locally signed delivery of the real Stripe session, rather than a public webhook endpoint. No real-money payments are permitted. Store-credit refunds are not automatically recredited by this test; the Stripe refund is restricted to the actual card capture.

External email, geocoding and site status remain fixture transports. Images use fixture assets. Browser screenshots are uploaded by both jobs even on failure.

## Known feature gap

The server admin client has no Deals dashboard route or package-builder page on this branch. Admin lifecycle actions can be tested through the implemented API, but admin UI creation, editing, preview, product selection and image upload cannot yet be verified. Passing API and storefront tests do not establish a complete admin-dashboard feature.

## Defect found and fixed

Real Stripe testing exposed a refund error for a £12.50 package order paid using £5 store credit: the application attempted a £12.50 card refund after capturing only £7.50. The Deals-only refund fallback now excludes applied credit. Three regression tests cover the full card refund and single component restock, rejection above the card capture, and cumulative partial refunds exhausting only the captured card amount. Existing ordinary-order handling is unchanged.

## Results

Verified on 13 October 2026. Server browser source: `e7b5ad81d830834528a698ee6871349cd069afb0`; customer storefront: `41d3b17b67b7b1621bdb43081b4330cb93b6d923`.

| Check | Result | Evidence |
| --- | --- | --- |
| Complete backend regression | 1,574 tests / 183 suites passed, including 212 Deals tests / 18 suites | [Backend job](https://github.com/Litwebs/Levants-server/actions/runs/38357626647/job/115164121801) |
| Actual storefront / API / MongoDB | 12 scenarios passed | [Browser/API job](https://github.com/Litwebs/Levants-server/actions/runs/38358290096/job/115166217756) |
| Real Stripe test-mode hosted payment and refund | Card-only and £5-credit-assisted cases both passed, including confirmation page, basket clearing, signed payment replay and component restock | [Stripe job](https://github.com/Litwebs/Levants-server/actions/runs/38358290096/job/115166217816) |
| Storefront unit and browser tests | 28 unit tests and 20 Chromium browser checks passed; app typecheck, scoped lint and production build passed | [Client rerun](https://github.com/Litwebs/Levants-client/actions/runs/38312744667/attempts/2) |
| Existing client UAT/subscription Node tests | 29 passed locally | Existing scripts/tests |
| Complete client typecheck | App and tooling TypeScript projects passed locally | `npm run typecheck` |

The backend job tested `f5bae14e6836dee4b1c6a44d524697102f3b0ba8`. The subsequent browser-source change only restricts the test request bridge to the storefront host; application and regular test files are identical to the passing backend run.

Screenshots: [browser/API evidence](https://github.com/Litwebs/Levants-server/actions/runs/38358290096/artifacts/11793358473) and [real Stripe evidence](https://github.com/Litwebs/Levants-server/actions/runs/38358290096/artifacts/11793298507). These Actions artifacts expire according to repository retention settings.

The implemented backend and customer storefront are verified in this isolated environment. The missing admin package-builder UI remains unverified and unimplemented. This report is not a release approval or an instruction to merge. No UAT, main or production changes were made during this verification.
