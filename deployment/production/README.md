# Compatible production rollback

The subscription follow-up stores `Order.deliveryStatus=cancelled`.
The previous production schema rejects that value. Rolling back directly to the
unmodified old SHA can therefore fail when saving an already-cancelled order.

`compatible-rollback.py` creates a local fallback commit from the previous
application commit, changing only the delivery-status enum to accept cancelled.
It preserves the old application behaviour and all financial, stock and other
fulfilment fields. An offline Mongoose validation checks cancelled and existing
statuses and rejects unknown values. Preparation does not check out code, restart
the application, connect to MongoDB or rewrite historical records.

The existing VPS helper calls the protected preparation script immediately after
recording its previous HEAD, before checkout or dependency installation. Its
existing failure trap consequently restores the compatible fallback commit.
Already-compatible previous commits are returned unchanged. Missing, unknown or
invalid schemas fail closed before the new application is checked out.

The one-time preparation passed ten isolated Git/schema tests and five rehearsals
using the inspected helper fixture. On the VPS it repeated those rehearsals using
the actual helper with temporary repositories and inert npm/PM2/HTTP stubs, validated
the installed Mongoose model, backed up the helper and installed the hook without
changing production HEAD. The owner approved retaining that installation.

The automatic UAT-triggered production installation workflow has been removed at
the owner's request. UAT pushes no longer invoke this rollback installer on the
production VPS. Any future production rollback-configuration installation requires
separate explicit approval; do not reintroduce that automatic trigger.
The original helper backup and the fallback report are root-only:
- `/root/LWS-Scripts/05-auto-deploy.before-compatible-rollback.sh`
- `/root/LWS-Scripts/production-compatible-rollback.json`

Rehearsals cover success, install failure, health failure, PM2 restart failure and
preparation failure. Failure cases restore the prior fixture's application
behaviour with a compatible schema; a failed preparation stops before checkout.
The production deployment workflow verifies the installed script checksum and
helper hook before any deployment. UAT and main release checks repeat the tests.

For this release, record `compatibleRollbackSha` from the successful preparation
report as the server fallback, instead of the unmodified previous production SHA.
It is retained by a local non-branch Git ref under
`refs/levants/compatible-rollback/<previous-sha>`; no GitHub feature branch is made.
Never delete that ref while the release can still be rolled back. Use the
compatible fallback for a manual rollback too. Restore the prior protected
environment settings and rebuild/reinstall dependencies as required; retain
cancelled statuses in the database. A code rollback does not undo payments.

Preparation changes deployment configuration only. Main merge, production restart,
portal publication, production alert activation and live smoke checks remain part
of the separately approved server-first release. All preparation and final
exact-tree UAT workflows must succeed before that approval.
