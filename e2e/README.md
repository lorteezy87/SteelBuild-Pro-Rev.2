# E2E smoke tests (Playwright)

The **"unit tests pass ≠ it works"** safety layer. The Vitest suite + production
build can be green while the real signed-in workflow is broken (stale data,
RLS rejections, a wiring/async bug — the kind of failure only runtime shows).
These specs sign in with a real session and assert the daily-driver registers
(**drawings → submittals → RFIs**) actually render.

The **smoke** specs are **read-only** — they navigate and assert; they never
create, edit, or delete project data. The **fab-release gate** spec
(`fab-release-gate.spec.ts`) is the exception: it's mutation-aware (it inserts
into the append-only `fab_release_log` audit trail to prove the server gate), so
it MUST run against a dedicated **test org** only — see its section below.

## One-time setup (owner step)

Provisioning a login is the one thing that can't be automated here (creating
accounts / handling passwords is out of scope for the agent). Do it once:

1. **Create a dedicated test account.** Sign up through the app (or add a user
   in the Supabase dashboard) — e.g. `e2e@steelbuild-pro.com`. Strongly prefer
   a **dedicated test account in its own org with a sample project**, not your
   real owner login, so a future mutating spec can never touch live work.
2. **Make sure it can see a project** (the smoke specs assume the signed-in user
   lands on a project). Add the test user to at least one project with a few
   drawings / submittals / RFIs.
3. **Set the env vars** (locally in a shell, or as CI secrets):

   | Var | What | Example |
   |---|---|---|
   | `E2E_USER` | test account email | `e2e@steelbuild-pro.com` |
   | `E2E_PASS` | test account password | `…` |
   | `E2E_BASE_URL` | app origin to test | `https://steelbuild-pro.com` |
   | `E2E_SUPABASE_URL` | project URL (or reuse `VITE_SUPABASE_URL`) | `https://kjrwqagyeswwoxpjkcko.supabase.co` |
   | `E2E_SUPABASE_ANON_KEY` | anon key, public (or reuse `VITE_SUPABASE_ANON_KEY`) | `eyJ…` |

   The anon key is browser-public (it ships in the app bundle); it is not a
   secret. The **password** is — keep it in a secret store / CI secret, never in
   the repo.

## Fab-release gate fixture (mutation-aware)

`fab-release-gate.spec.ts` exercises the **server-arbitrated** fab-release gate
(client → RLS → BEFORE-INSERT trigger) — the boundary the Vitest suite can't
reach because it mocks supabase. It signs in via `fixtures/supabaseUser.ts`
(API, no browser) and inserts into `public.fab_release_log`, asserting:

- **BLOCKED** — an open RFI on a package sheet + no `override_reason` → the
  trigger raises `FAB_RELEASE_BLOCKED`.
- **OVERRIDE** — same package + an `override_reason` → inserts, and the *server*
  snapshots the overridden RFIs into `blocking_rfi_numbers` (the client never
  supplies them).
- **CLEAN** — a package with no open RFIs → clean insert, empty blocking set.
- **RLS** — a viewer-role user is rejected (insert needs **pm+** on the project).

⚠️ It **writes** to `fab_release_log` (append-only — no update/delete policy, so
no teardown). Run it against a **dedicated test org / project ONLY**, never live
work.

One-time fixture (in addition to `E2E_USER` / `E2E_PASS` / `E2E_SUPABASE_*`):

| Var | What |
|---|---|
| `E2E_FAB_PROJECT_ID` | a project in the test org where the test user is **pm+** |
| `E2E_BLOCKED_DRAWING_ID` | a drawing in that project whose sheet has an **OPEN** RFI |
| `E2E_CLEAN_DRAWING_ID` | a drawing in that project with **no** open RFI |
| `E2E_VIEWER_USER` / `E2E_VIEWER_PASS` | *(optional)* a viewer-role account; unset → the RLS-deny test skips |

**Pick the two drawings with the same function the gate uses**, so the fixture
matches the trigger's own view of "blocked":

```sql
select * from fab_release_blocking_rfis(array['<drawing-uuid>']::uuid[]);
-- >= 1 row  -> use it for E2E_BLOCKED_DRAWING_ID
--    0 rows -> use it for E2E_CLEAN_DRAWING_ID
```

Each sub-test **skips** (doesn't fail) when its fixture vars are unset, so this
spec is opt-in like the rest of the harness.

`fab_release_log` is **append-only** (no update/delete RLS policy — it's the
audit trail), so the OVERRIDE and CLEAN tests each add one row to the test
project per run, by design. If accumulation ever bothers you, purge with a
service-role script **against the TEST project only**.

## Run locally

```bash
npm run test:e2e:install   # one-time: download the Chromium browser
npm run test:e2e           # run the smoke suite
npm run test:e2e:ui        # interactive runner (debug selectors)
```

## Piece Control pilot fixture (mutation-aware and irreversible)

`piece-control-pilot.spec.ts` covers the server-mediated Slice 1–7 path:
import/reconcile, assignment, drawing link, material receipt, lot split,
release, all stations, shipment, delivery, erection, event history, and
reporting. It also checks direct-table denial, cross-tenant isolation, and
exception-release risk creation.

Use a dedicated disposable test organization only. The canonical logistics
events are immutable and the work package release is one-time, so the full
workflow fixture must be pristine before each enabled run.

| Variable | Requirement |
|---|---|
| `E2E_PIECE_PROJECT_ID` | Project in the dedicated test tenant; enables security checks |
| `E2E_PIECE_OTHER_TENANT_PROJECT_ID` | Project the E2E user cannot access; enables cross-tenant checks |
| `E2E_PIECE_FULL_WORKFLOW=true` | Explicit opt-in to irreversible lifecycle mutations |
| `E2E_PIECE_WORK_PACKAGE_ID` | Unreleased, otherwise empty work package in the test project |
| `E2E_PIECE_APPROVED_DRAWING_ID` | Active approved/approved-as-noted drawing in that project |
| `E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID` | Optional pristine package with canonical scope and a non-scope gate blocker |

The project must already be `pilot` or `live`, the primary user must be a
project admin/PM with command permissions, and all Slice 0–7 migrations must be
applied. Leave `E2E_PIECE_FULL_WORKFLOW` unset to run only the non-destructive
security checks.

Parse/gating check without credentials:

```bash
npx playwright test e2e/piece-control-pilot.spec.ts --list
```

Full dedicated-fixture run:

```bash
npx playwright test e2e/piece-control-pilot.spec.ts
```

`global-setup.ts` signs in via the Supabase API and seeds the session into
`e2e/.auth/state.json` (gitignored) — no login-modal automation, so the harness
doesn't break when the sign-in UI changes. With nothing configured, the run
fails fast with a clear message; `npx playwright test --list` works with no
secrets (handy for verifying the config parses).

## Staging post-deploy CI

The staging pipeline has a separate `staging-e2e-readonly` job, enabled by the
`STAGING_E2E_ENABLED` variable and the four `STAGING_E2E_*` credentials. It
runs `smoke.spec.ts` and `daily-workflow.spec.ts` first, then runs
`staging-auth-boundary.spec.ts` in a separate Playwright invocation. The second
invocation verifies unauthenticated protected-route rejection and signs out
only after the normal smoke is complete, so session revocation cannot interrupt
the navigation checks. Production mutation specs are not selected. Target
guards reject the production hostname and a non-staging Supabase ref.
Provisioning is in `docs/runbooks/staging-e2e-automation.md`.

The fab-release and Piece Control files now require the separate staging-only
mutation opt-in plus an explicit disposable-fixture declaration. Leaving that
opt-in unset skips both files, including in the production post-deploy job.

## Enable in CI

The job is **already wired** — `e2e-smoke` in `.github/workflows/ci.yml`. It
`needs: deploy` and `deploy` does **not** depend on it, so it runs *after* the
production deploy and a failing E2E run can never block or roll back prod. It
stays **skipped (never red)** until you switch it on. To enable:

1. **Set the repo VARIABLE** `E2E_ENABLED` = `true`
   (Settings → Secrets and variables → Actions → **Variables**). A *variable*,
   not a secret, because `secrets.*` is unreliable in a job-level `if`. Unset →
   the whole job is skipped.
2. **Set the repo SECRETS** (same page → **Secrets**) for sign-in:
   `E2E_USER`, `E2E_PASS`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`. With
   `E2E_ENABLED=true` but these missing the run goes red by design (you opted
   in). The `E2E_BASE_URL` is hard-set to production in the job.
3. *(Optional)* the **fab-release gate** secrets to also run that spec
   (test org ONLY — it writes): `E2E_FAB_PROJECT_ID`, `E2E_BLOCKED_DRAWING_ID`,
   `E2E_CLEAN_DRAWING_ID`, plus `E2E_VIEWER_USER` / `E2E_VIEWER_PASS` for the
   RLS-deny check. Leave these unset to run only the read-only smoke.

The job uploads the Playwright HTML report as a `playwright-report` artifact on
failure.

## Notes / follow-ups

- **Assertions are deliberately loose** (URL held + the page renders its own
  content + no uncaught page errors). After the first green local run, tighten
  to specific elements/test-ids if you want stronger guarantees.
- **Routes assumed:** `/Drawings`, `/Submittals`, `/RFIs`. Confirm against
  `src/config/routes.js` if a register doesn't load.
- **Fab release** is an action inside the submittal/drawing flow
  (`ExportFabReleaseModal`), not a route. The mutation-aware gate spec
  (`fab-release-gate.spec.ts`, see "Fab-release gate fixture" above) now covers
  the server boundary directly; a browser-driven path through
  `ExportFabReleaseModal` is a further layer if wanted.
