# Claude handoff reconciliation — 2026-09-21

Scope: the three supplied Claude sessions, both distinct pasted handoffs, current main at ada5426d, and read-only production catalog checks except the single authorized contractor-name correction below. Work is on `codex/claude-pending-issues`.

## Verified fixes in this branch

| Item | Resolution |
| --- | --- |
| Drawing register, markup export, workspace backup truncation (#447 → #448 → #450) | Integrated the stacked fixes in order. Reads page to completeness with stable ordering and fail on a failed page. Markup signoffs use their actual fields and revision scope. |
| Remaining unbounded comments and project registers | Added bounded page readers, retained on-hold projects, and surfaced load failures with Retry. Removed their lint exemptions. |
| Backup without an active workspace | Reject before querying; never mix organizations into a workspace-labelled export. |
| Generated schema types (#451) | Integrated current database types and the affected pay-app/photo typing fixes; no ratchet ignore lists grew. |
| PDF page collision repair (#458) | Integrated preservation of uncontested page assignments. Collisions are grouped by file URL, not drawing set. |
| RFI parties and import (#459, remaining portions of #453) | Canonical eight-party vocabulary; case-insensitive canonical values and generic Engineer → EOR. Unknown people/company text remains in assigned_to, with party unset. No S&H alias or guessed EOR. All eight chip colors use theme tokens. Unset parties display and aggregate as Unassigned, with a neutral color, instead of being mislabeled Contractor. |
| Company-neutral outputs (#456 / #453 overlap) | Retained main's organization-based sender contract; neutral calendar identity, import preview label, and company placeholder. Recorded approved GC-register ownership. |
| All project members may create change requests | Staged migration 20260921054458 changes both the invoker RPC and INSERT policy to the org-aware project-access helper. Atomic numbering, validation, auditing, and PM-only editing remain enforced. |
| RFI duplicate dates | Staged migration 20260921055027 synchronizes canonical and legacy date pairs for both writing applications, including clears. Conflicts fail visibly; backfill uses only existing dates. Constraint handoff reads the canonical date first. |
| Staging fixture (#446) | Replaced the proposed SQL seed with scripts/seed-staging.mjs: explicit staging target, generated password supplied outside source control, Auth admin user creation, real org/project RPCs, valid drawing defaults, atomic submittal number. |
| Staging reconstruction | Persistent schema-only branch ndyfjffsulfbwpmwdmic; synthetic org/project/account and private buckets; separate Cloudflare Worker configuration and CI deploy job. See staging-setup.md. |
| Live project-export failure | A real staging export failed on drawing_watchers, whose primary key is (drawing_id, user_id), not id. The Edge Function now pages by that composite key and the project-calendar key. It retains the live shared v2 contract and all 66 existing tables, adds the Rev.2 tables, preserves row file references and actor IDs, and lists stored objects separately. Eight focused tests and a complete 96-table live export pass. |
| Windows verification failures | LF checkout contract for byte-sensitive migration/CSP checks; file-scan tests get 30 seconds without changing assertions. |
| Mortensen → Mortenson | Corrected the one matching production project, ca598779-a332-4e65-8a13-30560d954016, only while the stored contractor value exactly equalled Mortensen. No bulk text replacement. |
| Obsolete Cloudflare URL variable | Removed CLOUDFLARE_BASE_URL after verifying no workflow reads it. |

## Findings that do not justify the proposed database changes

- **#441 is already recovered in main.** The migration body matches the recorded SQL; the older PR adds comments to it. No additional migration or ledger rewrite is needed.
- **Quarantined fabrication-gate lineage is settled.** Keep the quarantined 20260727232000 file out of replay; the stronger adopted gate is already live. Do not reapply it.
- **RFI-to-sheet relationships already exist.** Production has drawing_id, gc_drawing_id and drawing_set_id, with 3, 22 and 5 populated references respectively across 31 RFIs. The assertion that there is no schema crosswalk is stale. A richer UI linking workflow would be a separate feature.
- **GC upload status:** all 187 inspected rows are Uploaded; supported values are Uploading/Uploaded/Failed. No runtime writer uses Registered. Document registration and file upload state are different concepts; adding a status without a workflow is unwarranted.
- **Submittal returned_date:** 14 missing values belong to Draft, Submitted or Under Review rows. None has approval-date evidence. No date was invented or backfilled.
- **GC PDF page-1 claim:** separate single-page file URLs may all correctly use page 1. The handoff itself retracts the set-level collision claim.

## Deliberately separate or awaiting owner information

- **#457 branding:** reviewed as an independent visual change from a fourth Claude session. It remains separate from these bug fixes. No registration symbol was added.
- **Spare Supabase access tokens:** the handoffs do not identify which token IDs are disposable. The working repository token must remain; no credentials were revoked by guessing.
- **Deprecated remote functions / Stripe:** repository inactivity does not establish that external webhook clients are gone. No shared Stripe endpoints or schema were deleted without that evidence.
- **Contract execution:** requires the owner and counterparty, not a software change.
- **Stale Claude branch:** preserved because it contains the reviewed #458 fix and the user asked to pause and retain Claude work. Cosmetic deletion is unnecessary.
- **Production release:** the two new migrations are applied and stamped only on staging. The production drift check should continue to report them missing until the reviewed production rollout; they are explicitly classified required, not hidden by an allowlist.

## Verification

- Staging Linux CI passed all 6,744 tests and 18 desktop/mobile shell-recovery checks; six authenticated navigation/auth-boundary tests passed after deployment.
- Existing full suite: 701 files, 6,743 tests; 6,741 passed on the first completed run. The two Windows full-tree scan timeouts subsequently passed with their assertions unchanged.
- Targeted regression suites cover paging over 1,000 rows, later-page failures, organization isolation, party normalization, PDF page preservation, revision-scoped markup export and canonical RFI deadlines.
- Final RFI regression run: 16 files, 112 tests passed after correcting the unknown-party display and aggregate behavior.
- Lint, base TS, JS checking, strict-null and no-implicit-any ratchets, no-new-JS gate, scripts TypeScript and production build passed locally.
- Before new migrations, staging matched production at 140 public tables (all with RLS), 393 policies and 352 functions. Combined function-definition MD5: ac446bb3130e1fd6cf5a5ec3b1d67729 on both.
- Transactional database tests on staging prove viewer/field/PM creation, PM-only updates, cross-tenant and non-project-member denials, direct-insert rejection, evidence-based date backfill, both alias write directions, clearing and conflict rejection. Fixtures roll back.
- Real fabrication-release server checks passed: blocked, audited admin override, clean separate set, and viewer denial. Staging deployment and browser verification results are recorded in the staging runbook.
