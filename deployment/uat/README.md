# Isolated Levants backend UAT

Production's legacy script, checkout, PM2 daemon and workflow are unchanged.
UAT uses systemd to give its API and database separate accounts, restart
boundaries, filesystem restrictions and resource limits.

| Component | UAT |
|---|---|
| API | `levants-uat-api.service`, localhost port 5002 |
| MongoDB | `levants-uat-mongodb.service`, localhost port 27018 |
| Replica set / database | `levants-uat` / `levants_uat` |
| Database application user | `levants_uat_app`, read/write on UAT only |
| Runtime configuration | `/etc/levants-uat/api.env`, root and UAT runtime only |
| Releases | `/srv/levants-uat/releases/<commit>` |
| Active release | `/srv/levants-uat/current` |
| Captured email | `/srv/levants-uat/shared/email-outbox`, private files |

`provision.py` refuses to overwrite existing UAT targets. It generates fresh
database credentials, JWT secrets and an encryption key without printing any
values. It never reads production configuration. `bootstrap-admin.py` creates
one synthetic administrator; its generated login is root-only at
`/etc/levants-uat/initial-admin.json`.

## Current integration mode

Email is captured locally. Stripe operations and external image uploads are
unavailable. Background jobs and Stripe webhooks are disabled. The runtime
cannot connect to external IP addresses. Startup rejects changes to these
settings until an explicit, reviewed integration-enablement change is made.
This is a usable isolated backend/admin environment, not a complete payment
or image-upload acceptance environment. No production data is copied.

## Deployments

1. Commit changes to the `uat` branch (or manually run `uat.yml` from a reviewed branch).
2. CI runs safety checks, backend release tests and admin quality/build checks.
3. The verified source and admin artifact are packaged with commit and checksums.
4. A dedicated SSH key connects as `levants-uat-deploy`; its forced command
   permits only `deploy <40-character-sha>` and disallows forwarding and a shell.
5. The root-owned deployment wrapper validates the bounded archive, installs
   locked runtime dependencies as a restricted build user, publishes an
   immutable release, switches the current symlink and restarts only UAT.
6. The health response must identify both UAT and the expected commit. Failure
   restores the previous release (or stops UAT on its first deployment).

Configure the GitHub `uat` environment with secret `UAT_SSH_KEY` and variables
`UAT_HOST`, `UAT_PORT`, `UAT_KNOWN_HOSTS`. The known-hosts entry must come from
the already-trusted server key. Production deployment credentials are not reused.

Until DNS and HTTPS are configured, use an SSH tunnel to localhost port 5002.
The bundled admin uses same-origin `/api`, so it can share the UAT API hostname.

## Promotion to production

UAT deployment never promotes automatically. Record the approved immutable
revision from `/health` and the release manifest. Open a PR from that exact
revision to `main`; do not include untested later commits. The existing main
workflow reruns its checks and deploys the resulting main commit with production
configuration. The merge commit can have a different SHA; require its source
tree to match the approved candidate, or redeploy/retest it in UAT before merging.

The current production workflow deploys immediately on a successful push to
`main`. Do not merge the UAT implementation PR until it is explicitly approved
for production. This implementation does not replace that workflow or claim an
atomic production release/rollback mechanism. Such a change needs its own
reviewed production rollout. Database contents, credentials and UAT-only
configuration never move to production.

## Verification and recovery

`node --test server/scripts/uatSafety.node.cjs` exercises production defaults
and UAT rejection cases. The ordinary backend and admin release checks still apply.

Inspect service status rather than environment dumps. Do not use `pm2 env`,
print environment files or include captured messages in shared reports.
Production health and its working directory/revision must be checked before
and after UAT deployment and rollback exercises.

For manual UAT rollback, choose an existing immutable release, atomically switch
the UAT current symlink and restart only `levants-uat-api.service`. Database
changes are not rolled back by switching application code. Keep schema changes
backward compatible; do not delete prior releases until a retention policy is set.

Stripe sandbox activation is optional. With `UAT_STRIPE_MODE=test`, UAT requires
`sk_test_`, `pk_test_` and its own `whsec_` credentials, and
`STRIPE_WEBHOOKS_ENABLED=true`. Live webhook events are rejected. Email, storage
and background jobs stay isolated and disabled/captured. Use
`check-stripe.py` as root to validate `/etc/levants-uat/stripe.pending.env`
without printing credentials. Keep the API pinned to `2024-06-20`; modern
snapshot invoice payloads are normalized by the subscription webhook service.
Allow only Stripe's published API IP addresses in the UAT service network
policy, retaining the default deny rule. Refresh that list when Stripe changes
its published addresses: https://docs.stripe.com/ips .

UAT email can use `EMAIL_TRANSPORT=resend` with its separate
`RESEND_EMAIL_KEY`. Every single and batch message uses
`Levants UAT <no-reply@levantsdairy.co.uk>` and an `[UAT]` subject prefix.
Recipients are unrestricted, as requested. Production's email behavior is
unchanged. `activate-email.py` validates the protected `email.pending.env`,
adds Resend API IPs to the UAT-only network policy and tests with
`delivered@resend.dev`. Failure restores the prior UAT config. The network
allowlist is a DNS snapshot; if Resend changes its API addresses, refresh
`resend.conf` from `api.resend.com`, reload systemd and restart only UAT.

UAT Cloudinary may share the existing production product environment with
`UAT_STORAGE_MODE=cloudinary`. Credentials are entered into the protected
`cloudinary.pending.env`; they are never copied from production config.
Uploads receive generated unique IDs under `levants-uat/`, with overwrite
always false. Single and bulk deletions validate every public ID against that
prefix before calling Cloudinary. The wrapper exposes no rename, prefix-delete
or delete-all operations. This is application-level isolation, not separate
Cloudinary permissions or quotas. `activate-cloudinary.py` updates only UAT,
adds a DNS snapshot for api.cloudinary.com and tests upload/delete using a
synthetic pixel, restoring UAT config on failure. Refresh the service drop-in
if Cloudinary changes its API addresses.

Google geocoding and route optimisation can use the existing Google project
and credentials, sharing production quotas and billing. Set
`UAT_GOOGLE_MODE=enabled`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_PROJECT_ID` and
`GOOGLE_APPLICATION_CREDENTIALS=/etc/levants-uat/google-service-account.json`.
The service-account file is a protected root-owned copy readable only by UAT;
production's hardcoded credential path remains unchanged. `activate-google.py`
validates `google.pending.env`, adds DNS snapshots for maps.googleapis.com,
oauth2.googleapis.com and routeoptimization.googleapis.com, and tests both
APIs using public London landmarks with no customer data or database writes.
Failure restores UAT configuration. Refresh google.conf if provider API
addresses change. Scheduled jobs remain disabled until separately configured.

UAT schedules are enabled with `BACKGROUND_JOBS_ENABLED=true` only while
Stripe sandbox mode and webhooks are enabled. The existing dedicated MongoDB
validation remains mandatory. Order expiration and invitation cleanup run
every minute. Subscription invoice/price reconciliation runs every 15 minutes;
full maintenance, cancellation finalisation, auto-resume and slot scheduling
run daily at 06:00 Europe/London. Scheduler leases live in the UAT database.
`activate-jobs.py` restarts only UAT and confirms healthy scheduler registration,
restoring configuration if startup fails. The UAT health response reports
`backgroundJobsEnabled`; production health remains unchanged.

## Automated integration checks and promotion

Every push to `uat` now requires backend/admin release checks and the complete
real Stripe/Chromium suite before deployment. The browser suite runs on a
GitHub runner against an ephemeral Mongo replica set, local API, admin and
customer portal, using test-mode Stripe keys only. It never uses the VPS DB.
`portal.json` pins the exact customer portal SHA; update it when the companion
portal feature changes. No portal hosting changes are made by these tests.

Configure repository Actions secrets `STRIPE_TEST_SECRET_KEY` and
`STRIPE_TEST_PUBLISHABLE_KEY` with dedicated sandbox keys. A private portal
repository additionally requires `PORTAL_CLIENT_READ_TOKEN`. Do not supply
live keys. Avoid sharing the browser sandbox with other concurrent test runs.

After UAT deployment, the forced SSH command `verify <release-sha>` runs actual
provider probes as the unprivileged UAT service account, with the API's egress
allowlists and a four-minute resource limit. The suite checks:

- Stripe sandbox API, checkout expiration and signed webhook acknowledgement;
  missing/invalid signatures are rejected.
- Resend single and batch API acceptance to `delivered@resend.dev`, with UAT
  sender/subjects. This proves provider acceptance, not a human inbox delivery.
- Cloudinary synthetic image upload and deletion under `levants-uat/`, plus
  refusal of out-of-scope deletions before contacting the provider.
- Google geocoding and route optimization for public London landmarks.
- Dedicated UAT Mongo connectivity and scheduler lease exclusion using only a
  uniquely named synthetic lease. Existing release tests cover job behavior;
  this probe does not force daily processing of UAT customer subscriptions.

Provider reports contain only check names, results, durations and release SHA.
Failure blocks a successful UAT workflow and production promotion. Provider
checks run as a separate job so a transient failure can use GitHub’s **Re-run
failed jobs** without redeploying the immutable release. A failed
post-deployment probe leaves the UAT release available for diagnosis; health
failures during deployment still use the existing automatic rollback.
Synthetic Stripe sessions expire; uploaded images are deleted in `finally`.
A timeout/kill or provider outage can leave test objects requiring cleanup.
The full browser suite captures emails locally; only the provider probe sends
messages through Resend. It uses no real customer addresses.

Promote using a normal merge PR **`uat` → `main`**, after UAT is green and manual
acceptance is complete. Do not squash or rebase this promotion. The production
workflow requires successful UAT deployment/provider and browser jobs for the
latest UAT commit, and verifies the proposed production source tree is exactly
the same. If main changes meanwhile, merge main into UAT and run UAT again.
Configure main's branch rules to require `Production release gate` and a PR.
The gate takes effect on main when this workflow change is promoted; installing
it on UAT does not modify the currently running production deployment.
