# Security branch integration handoff — October 9, 2026

Draft [PR #540](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/pull/540)
preserves the isolated security implementation for review. **Do not merge or
deploy it wholesale.** This is a concrete integration requirement, separate from
the branch's local passing checks and the remaining hosted acceptance.

## Compared source

- Security source: `41d086d0349c68d0fec9e9eb3fb03b443e9e138f`.
- Subsequent `ba781739` changes only two test contracts and a narrowly scoped
  public-ingestion-key scanner allowance; application/SQL behavior is unchanged.
- Fetched main: `150feedcdbe1290fb1721eb13fe3bb6b279fa1ca`.
- Shared base: `1ce1d0a69f336218f94f8bf91d885e792235c0a6`.
- Main has 232 commits and security has 21 since that base.
- Read-only `git merge-tree --write-tree --name-only HEAD origin/main` reports
  31 conflicted paths. It did not change the index or working tree.
- Main's claim board records active overlapping release, recovery, billing,
  erasure and drawing-control work. This continuation kept the shared checkout
  and those claims untouched. Recheck current ownership and main before acting.

## Required reconciliation

| Area | Preserve and combine | Concrete verification after integration |
|---|---|---|
| Recovery | Keep main's `signOutAttemptRef` guard from `f84380a5b`: a late old `SIGNED_OUT` must not clear a newer login/recovery. Preserve this branch's PKCE, callback-failure handling, warm-native recovery and removal of Sentry identity. | Both same-user and different-user late-signout tests, installed SDK PKCE tests, recovery/MFA reload and cross-tab cases. |
| Signed preview hook | Use main's `.ts` filename and its active-workspace/synchronous-generation guards. Port this branch's user/MFA/recovery readiness, per-consumer state, 270-second request-start refresh and resume renewal. Remove the obsolete `.js` duplicate. | Main's null-workspace and A→null→A cases plus this branch's cross-account tests. Five-minute signatures cannot use main's five-minute timer or infinite lifetime for full URLs; full URLs now reauthorize. |
| Desktop retirement | Preserve the inert page and its auth/recovery gates. Remove discontinued slugs from every deploy choice and JavaScript/shell allowlist; some incoming additions are outside conflict hunks. | Old links cannot export credentials; both runtime entrypoints are inert; deprecated inventory fails when hosted slugs remain. |
| Project creation | Reconcile the two capacity candidates into one authoritative trigger strategy. Do not enable both triggers. This branch's earlier trigger waits on organization locks during restoration, before main's NOWAIT protection can run. Main's `create_project` also retains validation, normalization and extra payload fields. | Real PostgreSQL concurrent direct/RPC creates, restores, erasure lock order, isolation levels, current plan limits and all supported creation payload fields. |
| Archived piece edits | Rebase this branch's guards onto main's newer `link_piece_drawing_set` and `unlink_piece_drawing_set` from `20261008022100`; retain their piece `FOR UPDATE` serialization. Add the incoming `replace_piece_drawing_set` to the guarded inventory. Preserve main's split wrapper from `20261008021100`. | Archived/removed-member denial for replace as well as link/unlink; real wrapper split inheritance; current drawing release gate; concurrent archive/link/split/release. The current 23-command/68-check result covers this branch only. |
| Schedule imports | Preserve main's source UID/fingerprint retry recovery, complete fresh read, nullable unknown dates/phases, collision rejection and failed-link reporting. Add this branch's owner guards around every awaited read/write/follow-up. | Retry without duplicate tasks, failed reads/links, changed-source reconciliation and identity changes during preflight/create/link/invalidation. |
| Fab Release CSV | Preserve main's verified gate state/blockers and explicit advisory labels; use this branch's shared formula-safe CSV serializer and owner-aware export transport. | Correct authoritative versus advisory columns, formula-prefix handling, numeric values and identity-switch cancellation. |
| Crane and IFC navigation | Preserve the graphics/camera/reference improvements here and main's available-container fit behavior. Retain main's Drawing Control naming/consolidation while adding visible IFC navigation/search entry points. | Current protected routes at narrow/mobile/tablet widths, dual themes, camera resize, real IFC geometry and keyboard navigation. |
| Telemetry | Main already disables Replay/logs. Preserve the stricter envelope/URL/session/span restrictions here and main's current host/release configuration. | Installed-SDK transport assertions, useful sanitized correlation and no synthetic sensitive markers across all envelope channels. |
| CI and release | Union the security SQL packages with main's drawing/submittal, Stripe concurrent-PostgreSQL and project-limit checks. Keep both main's exact entry-byte/apex+www verification and this branch's build-revision/backend checks. Retain immutable action refs, separate environments, dependency gate and exact-SHA staging acceptance. | Run all checks on the combined source. Hosted environment restrictions and fresh workflow fixtures require separate acceptance. |
| Manifest and documentation | Preserve incoming applied-prerequisite facts; keep the ten new candidates required and desktop slugs deprecated. No drift exemption. The bounded fresh ledger inventory supersedes older absence prose only for its listed versions. | Exact candidate hashes, actual deployed routine/policy/catalog comparison, no lost incoming required classifications and no stale pending/applied claims. |

Backend comparison found these additional concrete resolutions:

- Account deletion: this branch already contains main's identity-preserving
  workspace deletion and `users_deleted: 0`. Preserve its handler together with
  the CORS/body/deadline/privacy protections in its entrypoint.
- Email send: this branch already contains main's caller-scoped project and PM
  checks. Keep its verified-mailbox, durable-quota, bounded-body and provider
  protections. Reintroducing main's editable mailbox metadata or count-based
  quota would regress those boundaries.
- Stripe: preserve main's explicit boolean mode, durable checkout, configured
  redirects and portal authorization recheck while retaining this branch's
  pinned dependencies and `boundedRequest`. Keep main's checkout/config tests,
  adding the real `boundedRequest`/`EdgeBoundaryError` imports and injected
  bindings their source harness needs. Retain this branch's webhook boundary
  harness. Main's SQL package adds `pg`, checkout cases, independent-session
  tests and staged acceptance; retain it and the corresponding
  `20261009125901` migration/classification. The atomic SQL and original
  `verify.mjs` are byte-identical across branches.
- The source resolver found exactly two superseded implementations among this
  branch's 23 inventoried piece commands: drawing-set link/unlink. Retain main's
  newer release helpers (`evaluate_fab_release_set`,
  `evaluate_fab_release_package`, `piece_control_drawing_is_approved`,
  `enforce_fab_release_gate`) alongside the guarded release implementation.
  Also assess incoming `replace_gc_issuance_shop_set_links`: its PM check alone
  does not establish the intended archived-project mutation policy. Add explicit
  archived-project tests before widening any archive-coverage claim.

This document does not grant deployment approval.

## Conflicted paths at the recorded main

```text
.github/workflows/ci.yml
.github/workflows/supabase-deploy-reviewed.yml
AGENT_CLAIMS.md
CLAUDE.md
scripts/__tests__/backendReleaseGate.test.ts
scripts/__tests__/migrationOverrides.test.ts
src/boot/AuthenticatedApp.jsx
src/components/calculators/CranePick3D.tsx
src/config/moduleRegistry.js
src/config/routes.js
src/hooks/__tests__/useResolvedFileUrl.test.tsx
src/hooks/useResolvedFileUrl.js
src/instrument.js
src/lib/AuthContext.tsx
src/lib/__tests__/AuthContext.passwordRecovery.test.tsx
src/lib/__tests__/passwordRecovery.test.ts
src/lib/__tests__/supabase.passwordRecovery.test.ts
src/lib/passwordRecovery.ts
src/lib/supabase.ts
src/pages/fabRelease/exportCsv.ts
src/pages/schedule/commitImportedTasks.ts
src/pages/schedule/useScheduleMutations.ts
supabase/functions/account-delete/handlers.ts
supabase/functions/email-send/__tests__/authorization.test.ts
supabase/functions/email-send/index.ts
supabase/functions/stripe-billing/__tests__/webhookHandler.test.ts
supabase/functions/stripe-billing/index.ts
supabase/production-ownership-manifest.json
supabase/tests/stripe-billing/README.md
supabase/tests/stripe-billing/package-lock.json
supabase/tests/stripe-billing/package.json
```

Automatic merge success on another path is not evidence of semantic compatibility.
Run the new shared-schema and current-main regression packages as well as this
branch's tests after reconciliation. No production data was read to prepare this
handoff; only source, metadata and migration-payload hashes were inspected.
