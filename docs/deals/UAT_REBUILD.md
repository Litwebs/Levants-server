# Deals-only integration on UAT

Base: `c943bf6ceb6a2fd647534b95b021aaa2156fad51`. Previous branch preserved at `backup/deals-before-uat-rebuild-20261012`.

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

Hosted backend verification before the final UAT refresh passed **1,563 tests across 182 suites**: all **1,354 UAT tests / 164 suites**, plus **209 deals tests / 18 suites**. All suites passed; no tests were skipped. Tested code: `c2bd66f6b1a2417ce4022ba8c43544781c9a5b68`.

[Backend verification run](https://github.com/Litwebs/Levants-server/actions/runs/38298704159).

Local verification: 52 unit tests, 13 UAT safety tests, JavaScript syntax and a Git tree audit passed. The audit confirms 886 existing UAT files identical and only seven existing server files changed for deals integration; all additions are deals files. Database-backed local execution is blocked by MongoDB aborting in the workspace, so database tests were verified in hosted CI.

The verification draft used the existing workflow without changing any workflow file. Its tested merge tree was identical to the feature head. Release-only Stripe/browser gates did not run in draft, so the overall release-gate check is red; the backend test job passed. No deployment or merge was performed by this work. The final refresh incorporates the subsequent UAT cancellation-presentation changes verbatim, including its new test suite. The deals implementation remains identical to the tested commit; the complete combined tree after this upstream refresh has not been rerun in hosted CI.
