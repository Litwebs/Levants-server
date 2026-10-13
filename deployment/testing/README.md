# Test suites and Actions results

The server repository contains the backend and admin frontend. The customer
portal is a separate repository, pinned by `deployment/uat/portal.json` for
browser integration tests.

## Backend

`backend-suites.yml` runs seven named Jest jobs: authentication/access,
products/variants, customers/portal APIs, orders/refunds, subscriptions/recovery,
delivery/navigation, and other business features/utilities. The suite inventory
is defined in `server/scripts/test-suites.json`. CI asks Jest for its actual test
inventory and rejects omitted, overlapping or empty suites. New test folders
must be assigned explicitly. Existing test files and assertions are unchanged.

Jest includes unit/service and API integration tests. A backend file named
`e2e.test.js` usually calls the API through Supertest; it is not a browser test.
Each suite has individual test names in its log, a per-file Actions summary and
a downloadable JSON report. Independent suites run in parallel; a failure does
not cancel the other suites. Compatible rollback has a separate safety job.

## Browser and Stripe

The reusable integration workflow runs five clearly named steps, in sequence:
order checkout/reviews; portal/admin invitations; subscription rules/schedules;
Stripe payments/refunds/webhooks; and subscription emails. Each step boots its
own isolated test stack, uses Stripe test-mode credentials and produces a
separate report. Later groups still run if an earlier group fails; the workflow
remains failed. No retries or relaxed assertions were added. These groups
reorganise the existing browser coverage; they do not add product, variant or
customer-management browser coverage.

## Release and UAT

Main PRs and main pushes use the named backend suites and the browser workflow.
Required checks `Backend tests`, `Client lint and build`, `Subscription E2E
(Stripe test mode)` and `Production release gate` retain their existing names.
The first and third are result checks, not additional test executions.

On UAT, the same backend suites feed the existing packaging/deployment job.
Focused status tests remain for early feedback; full backend tests and rollback
are no longer repeated inside the packaging job. UAT provider verification
still runs after deployment. The existing promotion-evidence job names remain
unchanged.

The admin release check still builds for verification; main's deployment build
remains separate. Artifact reuse and changes to production publishing are out
of scope for this organisation change.

`test-suites.yml` verifies the organisation on `fix/test`. It runs tests and
builds only: no SSH, production deployment or database access. UAT/main workflow
changes take effect only if this branch is separately approved and merged.

## Local commands

From the repository root, after installing `server` dependencies:

```sh
node server/scripts/test-suites.cjs verify
node server/scripts/test-suites.cjs backend orders
node server/scripts/test-suites.cjs backend catalogue
E2E_USE_STRIPE_CLI=1 E2E_USE_TEST_CLOCKS=0 node server/scripts/test-suites.cjs browser stripe
```

Browser commands also need the pinned portal/admin dependencies, Chromium,
Stripe CLI and Stripe test-mode credentials, as in the integration workflow.
