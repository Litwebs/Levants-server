# Production release decision and server-first procedure — 12 October 2026

The application release source is server UAT and portal UAT `0cc2e7e855d1385fcecfe717eb397f6fe270841d`.
Promote by merge with the tested tree unchanged; the server promotion gate rejects
squash/rebase or changes that have not passed UAT. Production application code has
not been merged, deployed or restarted by these preparation checks.

## Completed preparation

- Server and portal main are protected. Server requires Backend tests, Client lint
  and build, Subscription E2E (Stripe test mode), and Production release gate.
  Portal requires Lint, typecheck and build.
- The actual VPS helper was read in [read-only review 38259206202](https://github.com/Litwebs/Levants-server/actions/runs/38259206202).
  It validates a complete SHA, fetches main, checks out that SHA detached and
  compares HEAD before dependency installation and PM2 restart. Its rollback
  path restores the previous revision. Bash syntax passed. The helper was not executed.
- The release workflow now exposes a stable Subscription E2E (Stripe test mode)
  summary check and fails it unless the actual reusable Stripe/browser job passes.
  The full production release gate also requires successful exact-tree UAT evidence.
- [Portal preparation 38259705324](https://github.com/Litwebs/Levants-client/actions/runs/38259705324)
  passed lint, typecheck, 21 client tests and production build. Its production
  artifact contains the production API, has the correct CNAME/SPA fallback, no UAT
  API or Stripe secret, and a SHA/checksum release manifest. Nothing was published.
  The live GitHub Pages configuration is legacy publishing from gh-pages root,
  CNAME levantsdairy.co.uk, HTTPS enforced.
- [Fresh production audit 38236997392 attempt 2](https://github.com/Litwebs/Levants-server/actions/runs/38236997392/attempts/2):
  29 subscriptions, all eight required unique indexes, zero duplicate groups,
  zero unlinked paid invoices, zero duplicate London dates, zero stock reservation
  drift/missing variants and no aged recovery cases. The current UAT preparation
  push also refreshes the audit with the next three upcoming slots per subscription.
  Use the latest pipeline/report as authoritative for those upcoming dates.

## Server-first compatibility

Production portal main 9f74c118 sends no operationId for new subscription creation.
The release server requires one. Existing edit/pause/resume/cancel/item request
schemas accept missing operationId/expectedVersion and the controller provides
legacy mutation identities; old add-on requests already send their UUID.

This is not a seamless old-client/new-server pair for creation. New subscription
creation is unavailable between server deployment and portal publication, and old
open tabs may need a refresh afterward. Coordinate a short release window; do not
advertise uninterrupted subscription creation. Request-contract regression tests
cover the old shapes and rejection/new-shape acceptance. The full Stripe/browser
suite verifies the intended new server/new portal pair, not every old UI interaction.

## Approved deployment sequence

1. Owner adds the five deferred events on the live production webhook. Recheck
   coverage, retaining existing checkout/order events.
2. Obtain explicit release approval, including the server-first creation window.
   Record previous server HEAD and gh-pages HEAD for rollback.
3. Approve/merge the server UAT PR without altering the tested tree. Let the exact
   merged commit pass every release check; the server workflow deploys only afterward.
4. During approved deployment, configure the protected production server .env:
   SUBSCRIPTION_RECOVERY_ALERTS_ENABLED=true and
   SUBSCRIPTION_RECOVERY_ALERT_EMAIL=hm.mousavi.02@gmail.com.
   Preserve ownership/mode and a protected rollback copy; never print credentials.
   The app reads this file with dotenv override. A restart/redeploy is required.
5. Verify server Git HEAD equals the approved merge SHA, process/health and read-only
   admin/customer endpoints. Recheck live webhook configuration. Do not replay
   historical paid invoices to generate test evidence.
6. Merge the portal UAT PR, require its CI and publish a production build of that
   exact merged commit to the existing gh-pages root. Use the existing gh-pages
   package and protected GitHub authentication, e.g. npx gh-pages -d dist -r
   git@github.com:Litwebs/Levants-client.git after building/validating the artifact.
   Do not run npm run deploy after generating a manifest: its predeploy rebuild
   clears dist/release.json. Keep CNAME and 404.html. Publishing via a workflow's
   GITHUB_TOKEN alone does not trigger the legacy Pages build; use an authorized
   publishing identity or an explicitly requested Pages build.
7. Verify public release.json SHA, referenced asset checksums and API target, then
   smoke-test customer login, subscription list/details, admin and payment reporting.
   Verify production alert acceptance/delivery using an isolated synthetic probe
   scoped to production transport (not a fake financial record in the live database).
8. Monitor the first billing/delivery cycle. Roll back code/artifacts through the
   recorded revisions if needed; financial writes require case-specific review.

## Historical subscription behaviour

The daily job prepares slots; orders are created by confirmed paid invoices.
The new invoice handler freezes delivery/stock ownership, deduplicates orders and
payments, and recovers interrupted recent processing. It applies to existing subscriptions.

The recent recovery window is 36 hours. For an old invoice with existing orders,
the handler preserves known order identities, marks its legacy plan for review and
does not infer extra delivery days or blindly consume stock again. Older unlinked
invoices are reported for operator review rather than automatically replayed.
New invoices remain independently recoverable even if that subscription has a
historical exception.

The 13 funded orders for 14/18 October have matching invoice/payment funding and
delivery links but missing consumption journals. One historical delivery is planned
23 August and recorded 19 August. No speculative inventory/date/refund repair is
authorized or applied. These exceptions may produce recovery alerts and require
warehouse/operator evidence; they do not prove that every future invoice will fail.

## Verdict and limits

Application fixes are ready for promotion based on the completed UAT evidence.
Preparation does not constitute live deployment success. Latest exact-commit UAT
tests and deployment must pass before promotion. Stripe event activation, explicit
release approval, production alert activation, publication and postdeployment smoke
checks are intentionally outstanding until the release. Backup/Atlas setup remains
a separate deferred task under the owner's earlier decision.
