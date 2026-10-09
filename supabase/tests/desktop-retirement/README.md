# Discontinued desktop companion

The owner discontinued the companion on October 9, 2026. `/DesktopConnect`
retains an inert notice and a link to SteelBuild Pro, with no dedicated login,
session export, cryptography or protocol callback. Its query and fragment are
removed. The two Edge entrypoints always return 410 and contain no privileged
imports. Both slugs are deprecated in the ownership manifest: their continued
hosted presence now deliberately fails drift.

`npm ci --ignore-scripts && npm test` executes the original SQL plus the exact
retirement candidate in isolated PostgreSQL (PGlite). It proves runtime roles
lose create/redeem/table privileges while historical schema remains intact.

Release requires exact reviewed manual application and ledger stamping of
`20261009221740_retire_desktop_companion_handoff.sql`, removal of hosted
`command-center-read` and `command-center-session-handoff`, and deploying the
client. Verify both missing slugs and direct REST/RPC denial afterward. Do not
change the unrelated web Command Center, project handoff checklist or other
shared functions. No hosted mutation was performed during source preparation.

Previously transferred refresh credentials are ordinary browser-session
credentials. Endpoint removal and RPC revocation cannot revoke those sessions.
Inventory the affected users/sessions through approved Auth administration,
agree the sign-out impact, revoke applicable sessions, and verify refresh
denial. Do not claim companion-only revocation when the old protocol shared a
browser session. Historical encrypted envelopes remain inaccessible and subject
to reviewed retention/erasure; this migration does not drop customer history.
