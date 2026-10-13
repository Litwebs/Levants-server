# Backend-first UAT refresh

UAT baseline: `69539d9742caad5bca22d14fc8a55040b650f7ef`.
Owner's pushed Deals baseline: `b4d3e2f78352f961b35cae66cc288a42fb2d62a9`.

The merge direction is UAT into feature/deals. UAT and main are not updated.

## Preserved work

The complete pushed admin-client tree, including the latest Deals editor and preview changes, is preserved byte for byte. The Deals backend modules, organized 18-suite regression tests, browser/API integration and real Stripe sandbox verification remain present. Restored admin browser tests move to `server/e2e/deals` with their own Playwright configuration.

## Backend scope

Unrelated analytics, order-management, delivery, product, subscription, model and JWT changes use current UAT. Existing UAT workflows, deployment files, shared Jest setup and test app are unchanged.

Seven existing application files contain the required Deals routes, indexes, image references, checkout claims/pricing and Deals-only refund handling. Four browser support files add Deals fixtures, image-provider capture and Checkout event support. UAT's subscription Playwright configuration and environment helper remain unchanged; the separate Deals configuration supplies its admin browser environment. The backend package retains every UAT script and dependency and adds only two Deals browser commands.

The credit-assisted refund correction is restricted to Deals orders; ordinary order refunds retain current UAT behavior.

## Validation

Syntax validation and the Git scope audit passed. Hosted backend regression and safety checks are pending.

Frontend validation is deferred as requested. The restored UI still needs to be reviewed for backend draft/publication and savings-mode support before complete feature sign-off. No merge into UAT or production is authorized.
