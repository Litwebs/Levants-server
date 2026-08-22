# Customer Portal Subscription E2E Suite

This Playwright suite checks the customer portal against the subscription
rules in `docs/Subscription Rules.xlsx` while using the real application,
real Mongoose subscription/order/delivery models, and the real Stripe API in
**test mode**.

The suite is intentionally an executable specification. If application
behavior differs from a rule, the test fails and reports the mismatch. The
suite does not modify or compensate for application logic. Known ambiguities,
manual exclusions, and the complete row-to-test mapping are recorded in
[RULE_COVERAGE.md](./RULE_COVERAGE.md).

## Exact workbook coverage

`rule-matrix.js` exports exactly the 54 populated rows from the workbook's
`Rules Matrix` sheet:

| Workbook rows | Behavior                                         |  Cases |
| ------------- | ------------------------------------------------ | -----: |
| 2–13          | Add/increase before cut-off, funded and declined |     12 |
| 22–27         | Remove/decrease before cut-off                   |      6 |
| 32–43         | Add/increase after cut-off, funded and declined  |     12 |
| 52–57         | Remove/decrease after cut-off                    |      6 |
| 62–67         | Cancellation before and after cut-off            |      6 |
| 72–83         | Pause/resume before and after cut-off            |     12 |
| **Total**     |                                                  | **54** |

The matrix spans weekly single-day, weekly multi-day, and fortnightly
cadences. Applicable item rules also span add, increase, remove, and decrease
actions. The 54-row lane additionally asserts payment/refund amounts, live
versus pending subscription state, delivery and order scope, and negative
invariants for locked deliveries.

The executable export validates its own length, uniqueness, and workbook row
order when loaded. The ten cross-cutting invariants from the `Multi-Day Logic`
sheet are mapped in [RULE_COVERAGE.md](./RULE_COVERAGE.md#ten-cross-cutting-invariants).

## Test lanes

| Lane             | Spec                         | What it proves                                                                                                                                                                                                                                                            | Stripe CLI                                        |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Rule matrix      | `subscription-rules.spec.js` | All 54 workbook rows through authenticated portal APIs, isolated models, and real Stripe test-mode objects                                                                                                                                                                | Not required                                      |
| UI               | `portal-ui.spec.js`          | Five Chromium journeys: create a weekly subscription with a saved card, increase quantity before cut-off, stage a removal after cut-off while preserving the locked order, pause/manual resume, and save a new card through real Stripe Elements                          | Not required                                      |
| Stripe integrity | `stripe-integrity.spec.js`   | Six checks covering Stripe cadence intervals, combined initial-plus-delta cancellation refunds, Stripe Refund-to-local order refund-history linkage, declined-add atomicity, funded-edit Price replacement/current-price selection, and payment-required automatic resume | Required only for the refund-webhook linkage case |
| Webhook          | `stripe-webhooks.spec.js`    | Two real, Stripe-signed initial-invoice checks for exact single-day and multi-day order/delivery creation                                                                                                                                                                 | Required                                          |

Playwright currently discovers 73 scenarios in total. Use
`npx playwright test --list` as the authoritative inventory; CI runs the
complete list with Stripe CLI webhook forwarding enabled.

All lanes use one Playwright worker and execute sequentially because they share
a locally managed test stack and create real Stripe test-mode resources. A
failed scenario does not skip the remaining scenarios.

## Safety boundary

Only Stripe test-mode credentials are accepted:

- `STRIPE_SECRET_KEY` must start with `sk_test_`.
- `STRIPE_PUBLISHABLE_KEY` must start with `pk_test_`.
- Never provide `sk_live_` or `pk_live_` credentials.

The harness checks these prefixes before importing the application and
refuses to start otherwise. Environment variables already exported in the
shell take precedence over values in the selected env file, so also check the
shell environment for accidentally exported live keys.

Stripe test mode still creates actual remote test objects and makes network
requests. Prefer a dedicated Stripe test account or sandbox, do not run lanes
in parallel against the same account, and never commit a test-key env file.

## Isolation model

No developer, staging, or production MongoDB is used. At startup the harness:

1. Creates a one-node `MongoMemoryReplSet` database named
   `levants-real-stripe-e2e`.
2. Overrides both `MONGO_URI` and `MONGO_URI_TEST` with that ephemeral URI.
3. creates a unique empty temporary working directory before application
   import so no repository or ambient `.env` can replace the validated test
   keys or isolated Mongo URI.
4. Starts the API on `127.0.0.1:5011`, the authenticated E2E control server on
   `127.0.0.1:5012`, and the portal client on `127.0.0.1:4173`.

The first run of `mongodb-memory-server` may need network access to download a
compatible MongoDB binary. An external MongoDB daemon is not required.

## Prerequisites

- Node.js and npm installed.
- Server dependencies installed from `Levants-server/server`.
- Customer portal dependencies installed in the sibling `Levants-client`
  repository, or in the directory selected by `E2E_CLIENT_DIR` in CI.
- Playwright Chromium installed.
- Network access to Stripe's test API.
- A test-only env file containing matching Stripe test-mode keys and the JWT
  secrets required by the application.
- For the optional webhook lane: the Stripe CLI installed and authenticated
  with `stripe login`.

From `Levants-server/server`:

```bash
npm ci
(cd ../../Levants-client && npm ci)
npx playwright install chromium
```

On a Linux CI host that also needs browser system packages, use the
environment-appropriate Playwright installation command, commonly:

```bash
npx playwright install --with-deps chromium
```

## Test-only environment

By default the harness reads `Levants-server/server/.env`. A dedicated file is
safer; select it with `E2E_ENV_FILE`. The minimum practical shape is:

```dotenv
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_TEST_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_TEST_KEY
JWT_ACCESS_SECRET=local-e2e-access-secret
JWT_REFRESH_SECRET=local-e2e-refresh-secret
STRIPE_DEFAULT_CURRENCY=GBP
```

Do not add a real Mongo URI. The harness supplies the isolated in-memory URI.
`STRIPE_WEBHOOK_SECRET` is not needed for the CLI lane because the harness
captures a fresh `whsec_...` value from its managed listener without printing
it.

Examples below assume a file at `Levants-server/server/.env.e2e`:

```bash
export E2E_ENV_FILE=.env.e2e
```

The export affects only the current shell. Alternatively prefix any command
with `E2E_ENV_FILE=.env.e2e`.

## Commands

Run commands from `Levants-server/server`.

List discovered cases without executing them:

```bash
npx playwright test --list
```

Run the full default suite. The Stripe CLI listener is disabled unless
explicitly enabled, so the three CLI-dependent webhook cases are skipped:

```bash
npm run test:e2e:subscriptions
```

Run the exact 54-row rule matrix lane:

```bash
npx playwright test subscription-rules.spec.js
```

Run one workbook row while diagnosing a mismatch:

```bash
npx playwright test subscription-rules.spec.js --grep 'Rules Matrix!32'
```

Run the browser-driven UI lane:

```bash
npm run test:e2e:subscriptions:ui
```

This lane is configured to run headed so a real browser window opens while the
spec executes.

Run the Stripe integrity spec without live webhook forwarding. The
webhook-only assertion is expected to skip:

```bash
E2E_USE_STRIPE_CLI=0 npx playwright test stripe-integrity.spec.js
```

Run the Stripe integrity spec with a managed Stripe CLI listener, including
its Refund-to-Order webhook-linkage assertion:

```bash
E2E_USE_STRIPE_CLI=1 npx playwright test stripe-integrity.spec.js
```

Run every webhook-dependent integrity and initial-invoice scenario with the
package convenience alias:

```bash
npm run test:e2e:subscriptions:webhooks
```

The listener is started and stopped by the Playwright web server. Do not start
a second `stripe listen` process for a normal run; the harness needs the
signing secret from the listener it manages.

Open the last HTML report:

```bash
npm run test:e2e:subscriptions:report
```

Test clocks are disabled by default because application cut-off rules use the
server's real clock. Set `E2E_USE_TEST_CLOCKS=1` only for a billing-time
scenario that explicitly needs a Stripe test clock; direct-customer cleanup is
used otherwise.

## Artifact locations

| Artifact                                    | Location                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Product specification                       | `docs/Subscription Rules.xlsx`                                              |
| Executable 54-row matrix                    | `Levants-server/server/e2e/portal-subscriptions/rule-matrix.js`             |
| Rule and invariant ledger                   | `Levants-server/server/e2e/portal-subscriptions/RULE_COVERAGE.md`           |
| This runbook                                | `Levants-server/server/e2e/portal-subscriptions/README.md`                  |
| Rule-matrix spec                            | `Levants-server/server/e2e/portal-subscriptions/subscription-rules.spec.js` |
| UI spec                                     | `Levants-server/server/e2e/portal-subscriptions/portal-ui.spec.js`          |
| Stripe integrity spec                       | `Levants-server/server/e2e/portal-subscriptions/stripe-integrity.spec.js`   |
| Stripe signed-webhook spec                  | `Levants-server/server/e2e/portal-subscriptions/stripe-webhooks.spec.js`    |
| Playwright configuration                    | `Levants-server/server/playwright.config.js`                                |
| Stack, fixture, safety, and control helpers | `Levants-server/server/e2e/support/`                                        |
| HTML report                                 | `Levants-server/server/playwright-report/`                                  |
| Traces, screenshots, and videos             | `Levants-server/server/test-results/playwright/`                            |

## Failure semantics

A failed rule assertion means the observed portal, model, delivery, order, or
Stripe state did not satisfy the normalized workbook expectation. The correct
triage sequence is:

1. Identify the workbook row in the test title.
2. Read its mapping and any conflict marker in
   [RULE_COVERAGE.md](./RULE_COVERAGE.md).
3. Inspect the retained Playwright trace and the before/after state assertion.
4. Decide whether the failure is an application defect or an unresolved
   product-policy conflict.

Do not make a failing test pass by silently weakening its oracle to match
current application behavior. Policy conflicts must remain explicit. This E2E
work adds tests and harness code only; it leaves application logic untouched.

## Cleanup

The control harness resets Mongo collections before scenarios and after each
suite. For Stripe test-mode resources it:

- deletes tracked test clocks;
- deletes directly tracked test customers when clocks are disabled;
- archives generated Stripe products; and
- clears its in-process fixture registry.

Normal Playwright shutdown also stops the API, control server, client, Stripe
CLI listener, Mongo connection, and in-memory replica set. Allow a run to
finish or stop it once with `Ctrl+C` so those handlers can execute.

If the process is force-killed or the machine loses power, remote Stripe test
objects from that run may remain. In the Stripe **test-mode** dashboard, find
customers by the `stripe-e2e-...@example.com` email prefix or `e2e=true`
metadata, test clocks named `levants-e2e-...`, and subscription products named
for `Stripe E2E`; remove/archive only those test objects.

## Troubleshooting

### Refusing to run because of Stripe keys

Confirm both keys use test prefixes. Check the selected env file and any
already-exported `STRIPE_SECRET_KEY` or `STRIPE_PUBLISHABLE_KEY`; shell values
win over file values. Live keys are intentionally rejected.

### Env file not found

Run from `Levants-server/server`, or set `E2E_ENV_FILE` to an absolute path.
The path is resolved by the stack process, not by the browser.

### Chromium executable is missing

Run `npx playwright install chromium` from `Levants-server/server`. In CI,
install the platform dependencies as well.

### Client server does not start

Confirm the sibling `Levants-client` directory exists and its dependencies are
installed. Playwright starts Vite there with the isolated API URL.

### MongoMemory startup or download fails

Allow the initial MongoDB binary download, verify the platform has a compatible
binary, and check the `mongodb-memory-server` cache/error output. Do not work
around this by pointing the suite at a shared Mongo database.

### Port already in use

Stop the process using `4173`, `5011`, or `5012`, then rerun. The ports are
fixed so the API, client, control harness, and Stripe listener agree on URLs.

### Stripe CLI does not become ready

Install the CLI, run `stripe login`, verify access to the same Stripe test
account as the supplied key, and retry the webhook command. Startup times out
after 45 seconds and withholds CLI output because it may contain a webhook
secret.

### Webhook signature or linkage case fails

Use the managed `E2E_USE_STRIPE_CLI=1` command so the current listener's
signing secret is injected before the application starts. Do not reuse a
`whsec_...` value from an earlier listener session.

### Stripe rate limiting or transient network failure

Run one lane at a time, retain the configured single worker, and retry after
the test account/API recovers. Parallelizing the matrix creates unnecessary
remote resources and can make cleanup nondeterministic.

### A rule test fails but Stripe calls succeeded

Open the HTML report and retained trace, then compare the exact workbook row
against [RULE_COVERAGE.md](./RULE_COVERAGE.md). A successful Stripe request
does not by itself prove correct subscription, order, delivery, refund, or
cut-off behavior.
