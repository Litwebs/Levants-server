# Interrupted payment-card updates

Default-card changes and deletions save a customer-scoped operation before changing Stripe. The operation contains a fixed list of Stripe commands, stable idempotency keys, the selected local card, and its creation time. A two-minute renewable lease serializes workers. Completion clears the operation in the same MongoDB transaction that updates local defaults, subscription pointers, and any deleted card.

## Normal recovery

Retry the same card action or refresh the payment-method page. Both resume the saved commands and complete the local transaction. A conflicting change or deletion is blocked until recovery finishes. After a process crash, retry after the lease expires. A failed transaction can temporarily leave Stripe ahead of the local records; the durable operation is the recovery source, so do not erase it or manually switch another card to bypass the guard.

## Escalation

Operations older than 23 hours stop automatic replay to stay inside Stripe's idempotency retention guarantee. Support must reconcile the stored commands against the actual Stripe customer default, each listed subscription override, attachment state, and local card/subscription pointers before completing a repair. Do not blindly clear the operation or detach another card. There is no automatic repair for this aged-operation case in this change.

The internal fields `paymentMethodOperation` and `paymentMethodLock` are excluded from normal customer queries. Authorized diagnostics must explicitly select them. Stripe and MongoDB cannot share one transaction; this mechanism provides recoverable convergence and prevents conflicting card mutations, not instantaneous cross-system atomicity.
