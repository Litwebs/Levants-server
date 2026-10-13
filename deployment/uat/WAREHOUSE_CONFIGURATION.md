# UAT warehouse configuration

UAT reads its own protected /etc/levants-uat/api.env and does not inherit the
production .env. Route generation requires WAREHOUSE_LAT and WAREHOUSE_LNG there.
The quoted decimal values supplied by the owner are valid; the missing settings,
not quote parsing, caused the Invalid warehouse coordinates response.

The owner-approved one-time configuration added only those two settings, backed
up the old UAT environment privately, and restarted only levants-uat-api.service.
All unrelated UAT settings and credentials were preserved verbatim. The running
UAT process was checked to have loaded both approved values.

Eight isolated tests passed. The maintenance report verified UAT health and
release identity, plus unchanged production health, Node process identities and
Git HEAD. No production environment file or database records were changed.

[One-time configuration run](https://github.com/Litwebs/Levants-server/actions/runs/38376914625)
contains the verification report. The temporary workflow was removed afterward.
The scoped maintenance script remains for separately approved future use; it
does not run automatically on UAT pushes.
