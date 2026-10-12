# Deals-only integration on UAT

Base: `2265d0eb007279abdb2d72a540017b1df1baf616`. Previous branch preserved at `backup/deals-before-uat-rebuild-20261012`.

Only backend deals changes are included. Existing frontend/admin client, workflows, scripts, package files, order models, analytics, subscription and delivery implementations come unchanged from UAT.

## Necessary shared integration

- `server/app.js`: mount admin and public deals routes.
- `server/config/db.js`: initialize deal indexes explicitly.
- `server/services/files.service.js`: preserve images referenced by deals.
- `server/validators/order.validators.js`: accept bounded optional deal claims on checkout only.
- `server/controllers/orders.public.controller.js`: forward deal claims; authenticated portal checkout already forwards validated fields without modification.
- `server/services/orders/orders.public.service.js`: validate package claims in the existing stock transaction; apply package savings; retain price snapshots in order metadata; combine deal savings with store credit in Stripe. Requests without deals retain UAT behavior.
- `server/services/orders/orders.refund.service.js`: delegate only deal order refunds to a new transaction helper and guard deal component restock on webhook replay. The existing ordinary-order refund path is unchanged.

All other existing UAT files are unchanged. Catalog browsing is implemented in a new deals service rather than altering generic variant search. No unrelated product-name snapshots, analytics changes, delivery changes or test-runner changes were brought over.

## Tests

All previous deals suites are restored in `server/Tests/Deals`, with a deals-only wrapper around UAT's test app and deals-only model initialization. Existing test files and shared test setup are unchanged. Coverage includes administration, publication, roles, images, indexes, catalog, stock, pricing modes, guest/customer checkout, store credit, claim tampering, stale claims, concurrent reservations, payment recovery, refunds and component restock replay.

Three isolated pricing/image/schema suites passed locally (42 tests). Database-backed local verification is blocked by MongoDB aborting on this workspace's runtime; a draft PR uses existing backend CI without modifying workflows or deploying UAT. Hosted CI status will be recorded after execution. No historical branch-wide results are used as proof for this rebuild.
