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
5. Require these checks: **Backend tests**, **Client lint and build**, and
   **Subscription E2E (Stripe test mode)**.
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

The deploy job depends on all three checks and therefore cannot start for a
failed commit. The client artifact uploaded to production is the exact build
produced by the successful check.

The admin client currently has a checked-in lint baseline of 395 warnings,
mostly legacy explicit `any` types. Release checks fail if that count grows.
Whenever warnings are fixed, lower `--max-warnings` in `client/package.json`
in the same pull request; the target is zero.

## Stripe production webhook setup

Run these commands from the deployed `server` directory. They read the
configured Stripe key; never paste a key into shell history.

```bash
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID --apply
node scripts/ensureStripeSubscriptionWebhooks.js --endpoint WEBHOOK_ENDPOINT_ID
```

The last command must report `"missingEvents":[]`. The script preserves all
currently enabled events and adds only the required subscription events.

Required events:

- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Afterward, send a test event from Stripe Workbench/Webhooks and confirm a 2xx
response in Stripe and the application logs.

## Historical subscription data

Do not blindly replay old paid invoices. A paid invoice is not sufficient to
decide whether milk was physically delivered, is still owed, or needs a
refund/credit.

1. Take a database backup/snapshot.
2. Run the read-only inventory:

   ```bash
   node scripts/auditSubscriptionIntegrity.js > subscription-audit.txt
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
   duplicate slot lists are empty, and both unique-index checks are true.
7. Check the next three delivery slots for every active subscription against
   its current selected weekdays before allowing route generation.

Historical writes should be applied from a reviewed invoice-by-invoice plan,
not an automatic bulk replay. The application automatically reconciles only
recent paid invoices because it cannot infer past physical delivery.
