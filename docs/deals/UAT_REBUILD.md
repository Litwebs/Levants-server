# Deals feature branch built from UAT

UAT baseline: `f916abdfaee697b3deb90e329f765854174c1d97`.

Existing UAT workflows, scripts, package files, shared test setup, order models, analytics, subscription and delivery implementations remain unchanged. A separate deals regression workflow adds verification without replacing the UAT suites.

## Shared application integration

Only seven existing application files change for deals: app route mounting, database deal indexes, public checkout controller and validator, image reference tracking, public order pricing and deal refund delegation. Ordinary orders retain the existing UAT paths. Catalog search, authentication guards and refund transaction handling for deals use dedicated new modules.

The portal manifest on this feature branch pins the tested customer storefront commit `41d3b17b67b7b1621bdb43081b4330cb93b6d923` for isolated verification and a potential future release.

## Verification

See [the browser verification report](BROWSER_VERIFICATION.md) for the final 13 October 2026 results and limitations. Complete backend regression passed **1,574 tests across 183 suites**: all 1,362 existing UAT tests / 165 suites, plus 212 Deals tests / 18 suites. Real-browser verification includes 12 API/storefront scenarios and two actual Stripe test-mode payment/refund cases. The client rerun passed 28 unit tests and 20 browser checks.

The Deals-only refund fallback now excludes applied store credit when determining the refundable card capture. Ordinary-order handling retains the UAT path. The admin package-builder dashboard page is still absent; its browser workflow cannot yet be verified.

Deals work remains on `feature/deals`. The previous UAT merges were reverted at the owner's request. Merge only after an explicit instruction identifying the source and target branches.
