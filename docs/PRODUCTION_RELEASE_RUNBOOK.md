# Production release runbook

## One-time GitHub setup

1. Add repository secrets `STRIPE_TEST_SECRET_KEY` and
   `STRIPE_TEST_PUBLISHABLE_KEY`. They must be test-mode keys (`sk_test_` and
   `pk_test_`), preferably from a dedicated Stripe sandbox.
2. Keep the existing VPS secrets: `VPS_SSH_KEY`, `VPS_HOST`, and `VPS_PORT`.
   Add `PORTAL_CLIENT_READ_TOKEN`, a fine-grained read-only token for the
   separate private `Litwebs/Levants-client` repository used by browser E2E.
3. In **Settings → Branches → Add branch protection rule**, protect `main`.
4. Enable **Require a pull request before merging** and **Require status checks
   to pass before merging**.
5. Require these checks: **Backend tests**, **Client lint and build**,
   **Subscription E2E (Stripe test mode)**, and **Production release gate**.
   The gate rejects failed or skipped prerequisite jobs. Draft PRs skip E2E;
   mark the release PR ready for review and wait for its current head to pass.
6. Disable bypasses/direct pushes to `main` for normal contributors.
7. Update `/root/LWS-Scripts/05-auto-deploy.sh` to fetch and check out the
   commit in `DEPLOY_SHA` before installing dependencies or restarting the
   application. It must fail when that SHA cannot be checked out. The workflow
   independently verifies the remote `HEAD` before uploading the client.

   The helper's repository-update section should enforce this shape:

   ```bash
   test -n "$DEPLOY_SHA"
   git fetch origin "$DEPLOY_SHA"
   git checkout --detach "$DEPLOY_SHA"
   test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"
   ```

The deploy job runs only for a push to `main`, after **Production release gate**
and **Build deployment client** succeed for that merged commit. The uploaded
admin artifact is a separate build of that same commit, not the PR build.
The VPS helper must honor `DEPLOY_SHA`; checking the remote `HEAD` afterward
detects a mismatch but does not undo a restart of the wrong code.

Record the server merge SHA and customer portal SHA from the E2E job summary.
For server PRs ending in `-server`, CI uses the matching portal branch when it
exists; otherwise it uses portal `main`. The server push-to-main run uses portal
`main`. Protect the portal repository's `main` with its own applicable checks,
coordinate both releases, and verify the deployed portal SHA separately: this
server workflow does not deploy the customer portal. A green server PR alone
does not verify the eventual production pair.

The admin client currently has a checked-in lint baseline of 395 warnings,
mostly legacy explicit `any` types. Release checks fail if that count grows.
Whenever warnings are fixed, lower `--max-warnings` in `client/package.json`
in the same pull request; the target is zero.

## Stripe production webhook setup

Run these commands from the deployed `server` directory. They read the
configured Stripe key; never paste a key into shell history.

First confirm the deployed revision and target environment: `MONGO_URI`,
`STRIPE_SECRET_KEY`, and `NODE_ENV` must identify the intended database and
Stripe account/mode. Configuration loads the local `.env` with override enabled;
do not assume an exported shell value overrides that file. Do not print secrets.
In Stripe, verify the selected enabled endpoint's URL is the intended deployment's
`/api/stripe/webhook`, and that `STRIPE_WEBHOOK_SECRET` belongs to that endpoint.
The event checker does not verify URL, signing secret, or actual delivery.

```bash
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID
```

The default command is read-only. It exits `0` when no events are missing,
`2` when required events are missing, and `1` on a configuration/API failure.
Review the endpoint ID and missing events before approving this Stripe write:

```bash
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID --apply
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID
```

The last command must report `"missingEvents":[]`. The script preserves all
currently enabled events and adds only the required subscription events.

Required events (all 10, from
`server/utils/subscriptionWebhookConfiguration.util.js`):

- `invoice.created`
- `invoice.voided`
- `invoice.marked_uncollectible`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `refund.created`
- `refund.updated`
- `refund.failed`

An enabled endpoint subscribed to `*` satisfies the event check. Existing
non-subscription events must remain enabled; this list is not a replacement
for checkout/order event subscriptions. Explicitly select the endpoint when
there is more than one enabled endpoint in the account.

Exercise signed event delivery in staging with test-mode Stripe objects. Confirm
the matching event ID, a 2xx delivery result, and the expected local state change;
a generic 2xx receipt alone does not prove subscription processing. Production
verification needs the live endpoint, live signing secret, and controlled live
evidence. Do not replay historical paid invoices merely to smoke-test a webhook.

## Database and recovery preflight

From the deployed `server` directory, run the read-only audit against the
intended environment, explicitly selecting the Stripe endpoint:

```bash
node scripts/auditSubscriptionIntegrity.js --endpoint WEBHOOK_ENDPOINT_ID > subscription-audit.txt
```

The audit disables automatic index creation and does not repair data or Stripe
configuration. Exit `0` means its checks found no counted issues; exit `2` means
issues require review; exit `1` means the audit failed or could not finish.
Require the final `AUDIT_RESULT` to report `"ok":true` and `"issues":0` for a
clean result. A partial report or an exit code alone is not sufficient evidence.

Every row of `INDEX_INTEGRITY` must have `ok: true`. All eight indexes below
must be unique, with the specified keys and partial filter where applicable:

| Collection | Index keys | Partial filter |
| --- | --- | --- |
| `subscriptiondeliveries` | `{"subscription":1,"scheduledDate":1}` | None |
| `orders` | `{"stripeInvoiceId":1,"subscription":1,"deliveryDate":1}` | `{"stripeInvoiceId":{"$type":"string"}}` |
| `subscriptionmutations` | `{"customer":1,"operationId":1}` | None |
| `subscriptioninvoicefulfillments` | `{"subscription":1,"invoiceId":1}` | None |
| `subscriptionstockreservations` | `{"key":1}` | None |
| `paymentmethods` | `{"customer":1,"provider":1,"providerReference":1}` | `{"providerReference":{"$type":"string"}}` |
| `payments` | `{"subscriptionInvoiceKey":1}` | `{"subscriptionInvoiceKey":{"$type":"string"}}` |
| `storecredittransactions` | `{"customer":1,"idempotencyKey":1}` | `{"idempotencyKey":{"$type":"string"}}` |

If an index is missing or duplicate data prevents creation, stop the release,
back up the database, and use a reviewed migration/deduplication plan. Do not
drop collections or run blanket index synchronization as a shortcut.

Review the other report sections too:

- `RECOVERY_INTEGRITY`: unresolved mutations, invoice plans needing review,
  saved-card operations, unfinished resume payments, and webhook configuration.
  Held inventory is not automatically an error; reconcile it with stock ownership.
- `STOCK_INTEGRITY`: stock/reservation drift and missing variants must be resolved.
- Per-subscription rows: unlinked paid invoices, duplicate delivery dates,
  unaccounted stock on paid orders, and old held draft invoices need classification.
  Orders outside the current schedule may be legitimate historical/protected
  deliveries; review them rather than rewriting them automatically.
- `BATCH_INTEGRITY`: review batch/order delivery dates. These rows are printed
  for inspection and are not included in the audit's issue count.

Never clear saved financial plans or held reservations just to make the report
green. Resolve/recover them through a reviewed plan and rerun the audit. Store
the report securely with the release evidence; it contains operational identifiers.

## Historical subscription data

Do not blindly replay old paid invoices. A paid invoice is not sufficient to
decide whether milk was physically delivered, is still owed, or needs a
refund/credit.

1. Take a database backup/snapshot.
2. Run the read-only inventory:

   ```bash
   node scripts/auditSubscriptionIntegrity.js --endpoint WEBHOOK_ENDPOINT_ID > subscription-audit.txt
   ```

3. For every subscription with `unlinkedPaidInvoiceIds`, run:

   ```bash
   node scripts/diagSubscription.js --number SUBSCRIPTION_NUMBER
   ```

4. Build a row for every unlinked invoice and expected delivery date. Have
   operations classify each row as **delivered**, **still due**, or
   **missed/refund** using route sheets and driver/customer evidence.
5. For **delivered**, add/link the historical order and payment record without
   putting it into a future route. For **still due**, create the paid order for
   an agreed future date and route it normally. For **missed/refund**, issue the
   Stripe refund/credit first, then record the local refund outcome.
6. Re-run both diagnostic scripts. Do not close the incident until every paid
   invoice has an order/payment or an explicitly documented refund/credit,
   duplicate slot lists are empty, and all eight unique-index checks are true.
7. Check the next three delivery slots for every active subscription against
   its frequency, weekly selected days or monthly calendar cadence, protected
   deliveries, and staged changes before allowing route generation.

Historical writes should be applied from a reviewed invoice-by-invoice plan,
not an automatic bulk replay. The application automatically reconciles only
recent paid invoices because it cannot infer past physical delivery.

## Production sign-off evidence

Passing CI and updating this runbook do not constitute production sign-off.
Before release, record the owner, time, environment, and result for:

1. Current release checks, the exact server/portal pair, and both repositories'
   branch protections. After merge, require the new server push checks too.
2. A recoverable database backup, reviewed data/index changes, and a rollback
   plan compatible with any data changes; verify the restore procedure in staging.
3. The completed live integrity audit and reviewed historical exceptions,
   including the uncounted batch/schedule observations described above.
4. Correct live Stripe endpoint URL, event coverage, signing secret, and evidence
   of signed event processing, without creating unsafe replay or duplicate charges.
5. Scheduler execution, Europe/London cutoffs (including DST), cancellation
   completion, and recovery after a process restart, first rehearsed in staging.
6. Notification delivery and actionable failure/recovery alerts; do not count
   mocked email success in CI as live delivery evidence.
7. Deployed server and portal SHAs, admin/customer smoke tests, and a named
   operator monitoring the first scheduled billing/delivery cycle.

If any evidence is unavailable, mark that item **pending** and withhold production
sign-off. Do not treat an empty audit as coverage of scheduler, browser, email,
deployment, or rollback behavior that the script does not exercise.
