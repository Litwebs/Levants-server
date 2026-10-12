# UAT-preserving deals rebuild

Base: `2265d0eb007279abdb2d72a540017b1df1baf616`. Backup: `backup/deals-before-uat-rebuild-20261012` (`d650b3a2adf92180cee06762b135f5afe3d2f665`).

Every file present in the UAT base remains byte-for-byte identical, including server implementation, existing tests, admin client and all GitHub workflows. Only new deals files were added. The package builder catalog implementation is isolated in its own service instead of changing UAT variant search.

## Current status

Deals model, administration/public services, controllers, routes, pricing, image validation and request schemas are staged. They are not mounted in the running application. Checkout still behaves exactly as UAT; package checkout is not integrated.

Three pure unit suites are active. The remaining previous deals suites and their helper are preserved under `pending-integration/server/Tests/Deals`, outside Jest discovery, pending integration. Their original relative imports require placement back under `server/Tests/Deals` and deals-specific test app wiring before execution. Previous branch-wide CI results do not validate this rebuild. No existing UAT test was changed, removed or skipped.

## Proposed first integration patch — approval required

`PROPOSED_SHARED_INTEGRATION.patch` mounts the two routers, initializes deal indexes and protects deal image references during shared file cleanup. This patch is review material only and has not been applied. It changes exactly three existing files. Checkout changes are a separate follow-up review; the patch does not enable package checkout.

## Remaining integration and test plan

1. Approve/apply router, index and shared-image patch; add a deals-only test app wrapper and initialize the deal model inside new tests without editing UAT test setup. Restore and run admin lifecycle, access-control, catalog, image and index suites.
2. Prepare a separate minimal checkout patch for approval: optional deals claim validation, guest/customer controller forwarding, transaction validation, immutable deal metadata and savings plus store-credit handling. Preserve normal UAT order behavior, models, refund logic and fulfillment.
3. Restore checkout, pricing, stock, credit, cancellation/refund and recovery suites. Verify mixed baskets, changed/expired/inactive deals, component tampering, concurrency, inventory and idempotency. Run the full existing UAT regression suite alongside deals suites.
4. Keep workflow files unchanged. UAT deployment workflow only triggers on UAT pushes/manual dispatch and deploys UAT; do not dispatch it merely to test this feature branch. Any additional CI trigger requires separate approval.

The old branch remains available in the backup for recovering historical implementation and test evidence. No unrelated analytics, delivery, frontend, refund or test-runner modifications were carried over.

## Rebuild verification

The three active unit suites passed: 42 tests. The proposed patch passes `git apply --check` against this UAT base. Git tree comparison confirms zero modifications/deletions to any existing UAT path. Database and end-to-end tests have not been run against the rebuilt branch.
