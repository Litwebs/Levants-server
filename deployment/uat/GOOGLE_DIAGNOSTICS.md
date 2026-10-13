# Google provider diagnostics in UAT

The provider-check reporter emits allowlisted error codes and status values for
failed Google checks. It never emits exception messages, stacks, provider bodies,
request headers, URLs, tokens, private keys or project identifiers. Eight native
tests verify these restrictions before UAT validation proceeds.

DNS-policy diagnostics read only the root-owned Google network drop-in and resolve
the three configured Google API hostnames. The report contains endpoint labels and
address counts, not IP addresses or policy contents. It compares exact addresses
with google.conf; it does not claim to represent every other systemd allowlist.

A stale Google DNS snapshot is a possible cause of network failures. Inspect the
safe error classification and coverage results together before changing a policy.
Diagnostics do not relax the network sandbox or change credentials, Google API
permissions, production configuration or the root-owned deployment helper.

Use the latest successful exact-commit UAT pipeline as release evidence. An older
in-progress run containing reverted feature work must not be redeployed.

## Approved repair, 13 October 2026

The failing check reported ETIMEDOUT at the OAuth endpoint. Independent read-only
inspection found both current OAuth addresses missing from the Google snapshot,
while geocoding and route-optimization addresses were covered.

The owner approved a UAT-only repair. Eight isolated tests passed, then the
one-time maintenance refreshed only google.conf and restarted only the UAT API.
The previous policy was backed up privately. Production's health, Node processes
and Git HEAD were checked before and after and remained unchanged; the UAT
release identity also stayed unchanged. No database records were rewritten.

[Maintenance run 38371588106](https://github.com/Litwebs/Levants-server/actions/runs/38371588106)
records those checks. [Provider verification 38371899744](https://github.com/Litwebs/Levants-server/actions/runs/38371899744)
then passed all nine real UAT provider checks, including Google route optimization.
The temporary maintenance/verification workflow was removed after completion.

The refresh script remains reviewable under deployment/uat for explicit future
maintenance approval. It is not automatically installed or run on UAT pushes.
DNS snapshots can age again; diagnose coverage before another scoped refresh.
Use the newest exact-tree UAT pipeline as the final production-promotion evidence.
