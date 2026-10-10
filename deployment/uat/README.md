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
