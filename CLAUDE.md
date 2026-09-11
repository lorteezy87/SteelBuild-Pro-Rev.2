# SteelBuild Pro

## Stack
Vite, React 18, TypeScript, Supabase (project: kjrwqagyeswwoxpjkcko), Tailwind, Vercel.

Data layer: import `entities`/`auth`/`integrations`/`functions`/`getSignedUrl` from `@/api/supabaseClient` — a thin re-export barrel. The implementation lives in `src/api/client/*` domain modules (entities, auth, storage, uploads, llm, functions, entityClient, fieldMapping, …), not inline in supabaseClient.ts.

## Commands
- `npm run dev` — local dev server
- `npm run lint` — lint (must be clean before commit)
- `npm run test` — full test suite (4,417 tests / 479 files as of 2026-09-07)
- `npm run build` — production build

## Design system: SteelBuild dual theme
- Colors: CSS variables only (`var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--cmd-*)`, `var(--sbd-*)`). Never hardcode surface/text/border hex in components.
- Dark: SteelBuild Dark (`data-theme="dark"` + `html.steelbuild-dark`); accent gold `#C89B20` / `#E0B030`.
- Light: `[data-theme="light"]`; command Control Centers use `[data-skin="command"]` with `--cmd-*` (dark remap aliases SteelBuild Dark).
- Fonts: Barlow Condensed (display), Inter (body), IBM Plex Mono (numeric/code).
- Radius: use the shipped token/component radii for each kit; do not reintroduce a fake 2px-only rule.
- Theme preference: `sbp-theme` in localStorage, else `prefers-color-scheme`.
- Never use `<form>` tags. Never use Radix Dialog.

## Database / RLS
- All tables must have RLS enabled with explicit per-role policies. No blanket-`true` policies.
- Check `auth_rls_initplan` pattern on any new policy — wrap `auth.uid()` calls in `(select ...)`.
- SECURITY DEFINER functions must set `search_path` explicitly.
- Known-fixed classes of bugs (do not reintroduce): feature_flags privilege escalation, vendors blanket-true policies.

## Number-sequence integrity — DO NOT regress
Official record numbers (RFI/CO/submittal/…) come ONLY from the atomic DB RPC `get_next_sequence_number` — never derive the next number client-side. `src/components/shared/numberSequencing.jsx` once floored the RPC with a client-side `Math.max()`, which could mint duplicate numbers under concurrency; that was removed (fixed c5612168) — `getNextFormattedNumber` now re-allocates from the RPC until it clears any existing records, and fails closed if the RPC is unavailable. Keep it RPC-only. Gated by a hook (see `.claude/hooks/`).

## Linked-RFI id spaces — two columns, same name, different types
`drawings.linked_rfi_ids` is **text**: a comma-separated list of RFI *numbers* ("RFI #001, RFI #002" — what SheetFormModal asks detailers to type). `submittals.linked_rfi_ids` is **uuid[]**: FKs to `rfis.id`. `drawing_sets` has no such column at all. Never pool them into one set. Match numbers with the canonical `normNum` + `linkedRfiNumbers` from `src/lib/fabReleaseGate.ts` — comma-only split, `toUpperCase().replace(/[^A-Z0-9]/g,"")`. Hand-rolled variants have shipped twice that split on whitespace or kept the `#`, so "RFI #001" never matched and packages reported "Fab ready" with an open RFI against them (fixed e40711b8, df1d885e).

## Absence is not evidence
A NULL optional column means *unknown*, not *false* — never render it as an affirmative negative. The downstream date columns (`fabrication_finish_date` / `final_delivery_date` / `ready_for_install_date`) are hand-keyed in SheetFormModal and NULL on most projects; treating that as "not downstream" told users a revision was caught pre-fab on steel that may already be erected, and persisted the verdict to `drawing_revision_summaries`. `computeRevisionImpact` has a distinct `"unknown"` severity for this — keep the distinction in any new derivation (fixed 3e0320de). Same rule for the model roster: it is loaded lazily, so an empty array means "not loaded", not "none imported".

## Detailing Control Center — DO NOT regress
- **Model roster is lazy.** Live rosters reach ~28k rows and PostgREST caps a request at 1000, so `fetchAllModelElements` pages. Anything needing only "does a roster exist" uses `countModelElements()` (one HEAD request, zero rows). Never gate a *displayed claim* on the unloaded array.
- **Importers own their roster read.** `parseModelElementsCsv` decides create-vs-update purely from `existingElements`; a truncated or empty value silently duplicates the whole roster via `bulkCreate` (a plain insert, no upsert). Import modals must fetch and page it themselves, never take it as a prop (fixed 0d88e7b7).
- **`isClosedPackage` ≠ released.** It is terminal-*for-triage* and also fires on Void submittals and the deprecated `set_approval_status='approved'`. Use `isPackageReleasedForFab` for anything claiming the shop received work.
- **`drawings` has only `reviewer`** — no `assigned_to`, no `ball_in_court`. Those exist on `submittals` only.
- **Gate controls on the write validator**, not a hand-written weaker condition — use the `canWrite*` predicates in `format.ts`.
- **Row caps:** `LIST_ROW_CAP` (2000) is what a request *asks* for; `SERVER_MAX_ROWS` (1000) is PostgREST's `db-max-rows`. Truncation detectors must compare against `EFFECTIVE_LIST_CAP` (the min), or they can never fire.

## MCP server
`steelbuild-mcp-server` — 18 tools across portfolio/coordination/commercial/logistics domains. Authenticates via user JWT so RLS applies automatically. Don't bypass this with service-role calls in application code.

## Branches — PRs target `main`
`main` is the integration and GitHub default branch (verified 2026-09-11). Open PRs against `main`. Check the live default branch and `git rev-list --count origin/main..HEAD` before opening a PR; older notes naming `codex/base44-deploy-nick` are stale.

## Workflow rules
- Employment/IP conflict with S&H Steel is unresolved — do not add billing, multi-tenant signup, or public marketing copy without being told this has cleared legal review.
- Before touching Stripe/webhook code: idempotency is already implemented, don't remove it.
- Playwright E2E spec for the fab-release gate must stay green — this is a P0 path.

## What NOT to put in this file
Anything procedural (audit checklists, migration steps, RFI Copilot testing flow) belongs in `.claude/skills/`, not here. If Claude already does something right without being told, delete the line.
