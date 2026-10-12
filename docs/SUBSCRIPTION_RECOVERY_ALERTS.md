# Subscription recovery alerts

The scheduled subscription recovery audit can send email notifications for unfinished financial mutations, blocked/review-needed invoice fulfillment, interrupted payment setup, unfinished resumes, and aged stock holds. It does not repair data or retry customer payments.

## Configuration

Set these values in the application's protected environment configuration:

```dotenv
SUBSCRIPTION_RECOVERY_ALERTS_ENABLED=true
SUBSCRIPTION_RECOVERY_ALERT_EMAIL=your-operator@example.com
```

The default is disabled. One valid recipient is required. Changing the email address requires an environment update and application restart/redeployment, not a code edit. Recipient changes create a separate deduplication scope; ongoing incidents can notify the newly configured recipient. Keep the current protected configuration consistent with any automation that applies it.

For this task, the owner selected hm.mousavi.02@gmail.com. UAT configuration uses that address as the initial fallback, with repository variable UAT_RECOVERY_ALERT_EMAIL as an override. Production configuration has not been changed. Production activation belongs to the approved release.

## Behavior

- The existing audit normally runs every 15 minutes after invoice reconciliation.
- Healthy scans are silent.
- Notification state is stored in MongoDB's subscriptionrecoveryalerts collection, using its built-in unique _id index.
- Shared worker leases and persistent claims prevent concurrent sends; the provider idempotency key and frozen request payload cover retries after ambiguous responses or a worker crash.
- Successfully accepted incidents remain suppressed across restarts until a later scan observes resolution. A subsequent recurrence can trigger a new notification.
- Each scan sends at most five new/retry notifications, with pacing between requests. Remaining incidents stay queued for later scans.
- Failed sends remain pending. Uncertain deliveries older than 23 hours are logged as requiring operator review instead of automatically creating a new provider request outside Resend's 24-hour idempotency retention.
- Emails contain projected operation/invoice/subscription/reservation identifiers and detection time, with escaped HTML. They exclude customer contact information and request/card details.
- Email acceptance is not proof of inbox delivery; the labelled UAT test must also be checked in the recipient's inbox.
- If notification checks fail, the financial recovery audit remains available through logs and does not fail solely because email notification failed.

## UAT verification

The commit marker [verify-recovery-alert] opts a UAT pipeline into the one-time recipient configuration and synthetic live-email check. Ordinary UAT pushes do not automatically send another personal test email.

After full CI, deployment and the standard provider checks pass, the verifier uses a new isolated UAT MongoDB namespace containing one synthetic blocked invoice. It checks provider acceptance, repeat suppression and observed resolution, then removes only that owned namespace. It never imports production data or alters the active UAT subscription fixture.

The automated regression suite additionally checks concurrent workers, provider errors, preserved retry requests, expired retry windows, recipient changes, call limits, privacy and HTML escaping.

Provider reference: https://resend.com/changelog/idempotency-keys
