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
