# Backend-first UAT refresh

Historical backend-phase report. The subsequent admin implementation and frontend scope audit are documented in [ADMIN_VERIFICATION.md](ADMIN_VERIFICATION.md).

UAT baseline: `486a3478813c7a028799696c1ba9ca2112bf2a13`.
Owner's pushed Deals baseline: `b4d3e2f78352f961b35cae66cc288a42fb2d62a9`.

The merge direction is UAT into feature/deals. UAT and main are not updated.

## Preserved work

The pushed Deals editor, preview, API context and admin tests are preserved byte for byte. Unrelated frontend work is deferred for review; the subsequently merged UAT delivery-navigation files are incorporated unchanged. The Deals backend modules, organized 18-suite regression tests, browser/API integration and real Stripe sandbox verification remain present. Restored admin browser tests move to `server/e2e/deals` with their own Playwright configuration.

## Backend scope

Unrelated analytics, order-management, delivery, product, subscription, model and JWT changes use current UAT. Existing UAT workflows, deployment files, shared Jest setup and test app are unchanged.

Seven existing application files contain the required Deals routes, indexes, image references, checkout claims/pricing and Deals-only refund handling. Four browser support files add Deals fixtures, image-provider capture and Checkout event support. UAT's subscription Playwright configuration and environment helper remain unchanged; the separate Deals configuration supplies its admin browser environment. The backend package retains every UAT script and dependency and adds only two Deals browser commands.

The credit-assisted refund correction is restricted to Deals orders; ordinary order refunds retain current UAT behavior.

## Validation

The first refresh was tested at `ab2cdea94c7d40bab1cdd6191edba2f8d67b403c`. UAT advanced with delivery-navigation work during validation; the final combined backend was verified at `79d55f32e52e8f09041f1c6d58c91db78272966c`.

- Server JavaScript/CJS syntax and Git scope audit passed.
- UAT safety: 13/13 passed locally.
- Provider diagnostics: 8/8 passed locally.
- Promotion gate: 2/2 passed locally.
- Compatible rollback: 10/10 tests plus five offline deployment-helper rehearsals passed locally. These tests do not access production.
- Actual storefront/API integration: 12/12 scenarios passed in [the browser/API job](https://github.com/Litwebs/Levants-server/actions/runs/38368316662/job/115199168311).
- Real Stripe sandbox: card-only and £5-credit-assisted payment/refund cases both passed in [the Stripe job](https://github.com/Litwebs/Levants-server/actions/runs/38368316662/job/115199167739).
- Previous hosted backend regression: **1,574/1,574 tests across 183/183 suites passed**, with no skipped tests, in [the full backend job](https://github.com/Litwebs/Levants-server/actions/runs/38368316662/job/115199205588). This includes all 1,362 original UAT tests / 165 suites plus 212 Deals tests / 18 suites.

Frontend validation is deferred as requested. The restored UI still needs to be reviewed for backend draft/publication and savings-mode support before complete feature sign-off. No merge into UAT or production is authorized.

## Final combined verification

[The final workflow](https://github.com/Litwebs/Levants-server/actions/runs/38370379659) completed successfully on the exact combined commit `79d55f32e52e8f09041f1c6d58c91db78272966c`.

- **1,612 tests / 186 suites passed, with no skipped tests**, in [the full backend job](https://github.com/Litwebs/Levants-server/actions/runs/38370379659/job/115205637138): all 1,400 current UAT tests / 168 suites plus 212 Deals tests / 18 suites.
- The 12 storefront/API integration scenarios and both real Stripe sandbox payment/refund cases passed again after the navigation update.
- The 32 navigation unit/service tests passed locally using UAT's navigation-only Jest configuration.
- UAT safety and provider diagnostics passed again after the final refresh.
- The final scope audit confirms current UAT delivery/navigation code, models, shared Jest setup, deployment configuration and existing release workflows are unchanged. The owner's pushed Deals admin editor/context/tests remain byte-identical.

After this verified commit, UAT added only its one-time Google policy repair workflow and deployment scripts. They are incorporated unchanged, and all eight offline repair tests passed. All server application/test files and client files remain byte-identical to the passing combined runtime commit. The repair workflow is restricted to UAT with its explicit approval marker and is not triggered on feature/deals. Backend verification is complete; the frontend phase remains deferred.
