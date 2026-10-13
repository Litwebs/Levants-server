# Interrupted payment-card updates

First-time Stripe customer setup also saves its original provider request under
the shared customer lease. Concurrent setup receives a retryable busy response;
response loss reuses the saved key. After 23 hours, recovery paginates provider
history and requires exactly one customer with the saved account and operation
metadata. Unknown or multiple matches require review; no replacement identity
is created automatically. Read-only inspection:
`node scripts/recoverSubscriptionOperation.js --customer CUSTOMER_OBJECT_ID --profile`.
After reviewing the provider evidence, add `--apply` to finish the original plan.
The preflight and scheduler recovery checks flag aged profile setup too.

Default-card changes and deletions save a customer-scoped operation before changing Stripe. It freezes commands, local card identity and idempotency keys. A renewable lease and ownership fencing serialize workers. Local defaults, subscription pointers, card deletion and operation completion commit in one MongoDB transaction.

Retry the original card action or refresh the payment-method page to recover. Conflicting actions remain blocked. A process crash can leave Stripe ahead of MongoDB; the saved operation is the recovery source. Do not clear it or change another card to bypass recovery.

After 23 hours recovery inspects the provider's current customer default, subscription overrides and attachment state. Commands already at their desired state are skipped. A still-needed nonfinancial command gets a fresh key saved before execution. It then completes the original local transaction. Unknown, foreign or unavailable provider state fails closed for support review.

Support can inspect `node scripts/recoverSubscriptionOperation.js --customer CUSTOMER_OBJECT_ID --card` and, when authorized, add `--apply`. See [subscription operations runbook](subscription-operations-runbook.md) for preflight and recovery procedures. Internal operation and lock fields are excluded from normal customer queries. Stripe and MongoDB converge through saved recovery evidence; they do not share a transaction.
