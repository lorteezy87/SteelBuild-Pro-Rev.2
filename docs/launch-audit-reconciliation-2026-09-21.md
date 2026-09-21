# Launch audit reconciliation — 2026-09-21

The supplied Claude audit is useful as a backlog, but its 63/100 is a judgment-based score, not a measured acceptance criterion. The following checks use current main, the review branch, authenticated GitHub/Supabase APIs and downloaded live function source. This is separate from the three-session bug-fix reconciliation.

## Confirmed release-hardening work

| Finding | Current evidence and next action |
| --- | --- |
| Undeployed backend hardening | Live llm-proxy v42 was updated June 20 and still contains permissive CORS defaults absent from current source. A green inventory drift check compares slugs, not deployed code. Review and deploy the owned functions with their correct JWT modes; add a scoped backend CI path. Do not deploy every shared-project function indiscriminately. |
| No review/check gate on main | GitHub reports main protected=false. The active rule named Defau;t only contains a deletion rule, while Branch Protection is disabled. Require the reviewed CI checks and PR integration without creating an impossible approval requirement for a solo maintainer. |
| sheets-api security and provenance | Live v12 uses a shared passcode and a service-role client. The manifest names lorteezy87/steelbuild-sheets-web, but the authenticated repository lookup returned 404. Source can be downloaded from the deployed function. Recover and review its authoritative source and callers before changing bootstrap, authentication or deleting a shared dependency. |
| Definer read scope | evaluate_fab_release_package is authenticated-executable and has direct unscoped reads of drawing details. work_package_drawing_set_reports and piece_control_drawing_is_approved call evaluate_fab_release_set, which checks project access; the audit's claim that all three have no project check is too broad. Add explicit entry-point scope guards and prove cross-tenant denial on staging. |
| Password protection | Current Supabase security advisor confirms leaked-password protection is disabled. Review the live Auth configuration and enable it without applying unrelated local config defaults. |
| Privacy disclosures | Privacy.jsx and Subprocessors.jsx still name Vercel and omit Cloudflare and Resend. They already name Anthropic and masked Sentry session replay. Correct the hosting/email disclosures and review the blanket US-only processing statement before relying on it. |
| Source rebuild and DR | Staging was successfully restored from a current schema-only production dump and checked for catalog parity. This proves that recovery path; it does not prove replay from repository migrations or restoration of customer data/storage/Auth. Automatic branch replay remains unresolved. |
| CSP | The checked-in policy remains Report-Only. Enforce only after measuring violations across authenticated routes, PDF/IFC workers and integrations. |
| Performance | Fresh advisors report 73 unindexed FKs, 267 unused indexes, six duplicate indexes, two tables without a primary key and a fixed Auth connection allocation. These are investigation inputs, not permission to drop indexes or run downtime-producing VACUUM FULL. Prioritize actual query plans and referential workloads. |
| Netlify | The current PR still receives Netlify deployment checks. Establish the site's domains and users before disconnecting the legacy publisher. |

## Corrections and completed evidence

- The live legacy-app-files-copy source is a small unconditional HTTP 410 response saying the maintenance endpoint is permanently closed. An old deployment timestamp does not mean the old privileged copier is still running. Physical deletion is cleanup, not an emergency exposure fix.
- Production currently lists 11 Edge Functions, including account-delete. The blanket claim that all ten run old unsafe code is not established by timestamps alone.
- Atomic RFI/submittal numbering was already fixed; the full conversation retracts that finding. Keep the RPC-only contract.
- Trigger-returning functions cannot be invoked as ordinary SQL functions. Grant cleanup is distinct from an exploitable callable RPC.
- Staging now exists independently of production and runs authenticated browser checks. CI run 35569765272 passed 6,744 unit tests, 18 desktop/mobile shell recovery checks and six staging navigation/authentication checks.
- The live staging export uncovered and fixed a real composite-key paging error in drawing_watchers. The endpoint now exports 96 table sections and rejects inaccessible projects/unauthenticated calls.
- The current server's fabrication gate works at drawing-set scope, requires a governing IFC/Released submittal and files, and restricts overrides to admins. Fixtures now exercise blocked, audited override, clean separate-set and viewer-denied cases. These are server boundary checks, not a claim that a browser drove the complete release UI.

## Store and commercial claims requiring a separate decision

Apple's rules do not say that every WebView app is automatically rejected or that a fixed list of native features guarantees acceptance. Guideline 4.2 requires sufficient app-like value. The quoted blanket ban on external purchase links is also outdated: the current rules have US-storefront and other scoped exceptions. Multiplatform services (3.1.3(b)), enterprise services (3.1.3(c)) and free companion apps (3.1.3(f)) are distinct categories; do not treat them as interchangeable. Choose a distribution/payment model and then verify it against the current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Google's account-deletion requirement includes an accessible web deletion resource for applicable apps, alongside the in-app path. A deployed account-delete function alone does not prove the submitted app and store form meet the [account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Entity formation, DPA terms, signing authority, actual provider contracts and store declarations require owner facts. The presence of legal-page source files does not prove those commercial prerequisites. No new numeric launch-readiness score or store-approval prediction is asserted here.

## Sources for follow-up

- [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Supabase foreign-key index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Supabase duplicate-index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index)
- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)
- [Resend privacy policy](https://resend.com/legal/privacy-policy)

This document records findings and rollout boundaries. It does not mark the additional hardening work complete or authorize a production release.

## Additional production-readiness audit supplied during release

The owner also supplied `PRODUCTION_READINESS_AUDIT_2026-09-21.md`, audited at ada5426d. Its remediation prose is evidence and recommendations, not additional authorization to change production, purchase services, delete shared assets or build/store-submit native apps. The existing direction remains: finish #460, then prepare a separate hardening PR.

Verified against production on 2026-09-21:

- AUTH-1: the live `enforce_org_member_guard` handles INSERT/UPDATE only. Its UPDATE path checks last-owner demotion, but there is no DELETE branch. Prepare a serialized last-owner guard, immutable membership identity, and role-safe delete policy; preserve the approved erasure path.
- AUTH-3: live `accept_invitation` already compares the authenticated user's email to the invitation, checks pending status and expiration, and enforces member limits. The proposed cross-email redemption is not established. Invitation-token visibility and acceptance serialization still merit review.
- CI-1/CI-4: deploy jobs currently depend on `ci` alone. The no-new-JavaScript script silently succeeds when its comparison ref is missing. Make these checks binding and fail closed.
- EDGE-3 and CI-6 are superseded by #460: export v29 records the verified actor ID; restored staging runs the fabrication-gate checks. The browser specs call the server gate and do not yet drive the entire fabrication UI.
- The production-export compatibility review must also cover email-account credential columns before treating project backups as safe to share. Retaining a shared v2 format does not justify exporting authentication secrets.

Follow-up order: verified authorization and deployment controls; session and integration boundaries; the concrete schedule/pay-app/numbering/import regressions; then performance, recovery rehearsal and remaining audit findings. Paid PITR, legal execution, provider secrets unavailable for migration, native-platform builds and external store submissions remain separate owner-dependent work. Preserve the user's explicit exception that viewers may create change requests; do not blindly raise the shared numbering RPC to `field` and break that approved flow.

## Prepared changes after the #460 release

These are candidate changes on `codex/launch-security-hardening`, not production
remediation. #460 is already merged at `4837dd6bb`; its production CI run
`35575063074`, Worker health check and served JavaScript passed.

| Audit finding | Candidate implementation and evidence |
| --- | --- |
| AUTH-1, RLS-8 | Serialized last-owner DELETE/demotion protection, immutable membership identities and owner-safe DELETE policy. Transactional staging tests also prove an owner can remove a second owner and parent erasure still cascades. |
| AUTH-3 | Invitation listing restricted to workspace admins. Actual production acceptance already checks the invitee email; no claim of an established cross-email takeover. |
| RLS-1 | Audit RPCs derive/validate the record's project and require org-aware PM access, preserving their legitimate invoker callers and verified actor attribution. Staging proves viewer and cross-tenant denial plus normal PM creation/note behavior. |
| RLS-2 (verified subset) | Six live gaps receive restrictive field-role write policies: drawing analyses/findings, external linked folders and the three email tables. Existing read visibility is retained. Live sign-offs already require PM and verified actor; zones/links/dependencies already require PM; revision deltas already require field. Activities attribution remains a separate review. |
| RLS-6 (three entrypoints) | Explicit project checks on package evaluation, work-package reports and per-drawing approval. Anonymous access revoked. Other definer RPCs are still under review. |
| EDGE-1, EDGE-2 | Numeric-string token limits are normalized/clamped; every configured quota fails closed on unavailable/malformed usage; caller JWT authorizes telemetry project IDs before provider calls. This does not add atomic spend reservations. |
| EDGE-4 | Missing billing/payment or signing credentials return 503 before Stripe construction/signature processing; test mode cannot fall back to live keys. |
| EDGE-13 and export credentials | Streamed request bytes are bounded independently of Content-Length. Exports omit mailbox access/refresh tokens while retaining the v2 shape. Production currently has zero non-null mailbox token values, verified without reading any secrets. |
| CI-1, CI-4, CI-8 | Publishing requires secret scan, drift and the new three-function Deno check. JS gate fails on an unresolved comparison ref and compares a main push to its before SHA. No blanket Edge coverage is claimed. |
| Backend release process | Manual, named-function workflow preserves rollback source/JWT inventory and requires matching successful staging deployment before production. Environment tokens and review rules must be configured before use. |
| CI-3 (local script only) | `npm run deploy` fails with directions to CI. Actual branch protection still needs activation; fresh API evidence shows the repo is public and this account has admin access, so the audit's alleged plan-upgrade blocker is not established. |
| Privacy and DR-4 | Provider disclosures reflect Cloudflare, conditional Resend/Graph, weather/font requests and global processing; rollback/incident docs point to Workers. Legal approval and the actual restore drill remain outstanding. |

Unresolved high-priority work includes server-enforced MFA and its client race,
session/recovery cleanup, activity attribution, shared `sheets-api`
ownership/authentication, protected deployment credentials/main, leaked-password
protection, and the concrete schedule/pay-app/import/numbering defects. CSP,
database performance, migration replay, restore rehearsals, legal prerequisites
and native-platform readiness are also open. The new audit is not fully closed,
and this change must not be described as production-ready or as fixing every
finding in the report.

Further live-policy reconciliation: `number_sequences` has RLS enabled and no
authenticated write policies; the proposed direct counter-reset weakness in
RLS-4 is not present in the current policy set. Keep the atomic RPC's project
access guard because viewers are explicitly allowed to create change requests.
`pma_audit_logs` likewise has no current authenticated write policy. The audit's
static repository replay is not a substitute for the production catalog.

## Validation of the candidate

- Local verification passed lint, all four typecheck gates, production build,
  no-new-JavaScript comparison and Deno checks for the three selected functions.
- The full local suite passed 710 files / 6,828 tests. A subsequent quota
  compatibility test passed separately and preserves the documented non-positive
  configuration opt-out; malformed configuration still fails closed.
- The staging SQL boundary suite passed with all six field-write/viewer-read
  cases, last-owner protection, normal second-owner removal, membership identity,
  invitation visibility, anonymous/viewer/foreign-project denial, valid PM audit
  paths, viewer change-request creation and parent erasure. It rolled back.
- Candidate functions were deployed only to `ndyfjffsulfbwpmwdmic`. Real staging
  authentication returned 403 for a foreign AI telemetry project, 400 for invalid
  tokens on an accessible project, 400 for malformed project/provider selections,
  and 401 without a session. No paid model request was issued.
- Unconfigured staging billing returned the intended 503; this is not a Stripe
  checkout/payment success test. Test-mode billing configuration remains an
  activation prerequisite.
- Staging project export returned HTTP 200 with v2 format, 96 table sections,
  four drawing fixtures and two submittals. Mailbox-token omission also has a
  regression test using synthetic credentials.
- Production source for the current three functions was captured for rollback
  review. No hardening production function, SQL or hosting deployment occurred.
