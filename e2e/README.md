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

Each sub-test skips (doesn't fail) when its fixture vars are unset, so this spec
is opt-in like the rest of the harness.

## Run locally

```bash
npm run test:e2e:install   # one-time: download the Chromium browser
npm run test:e2e           # run the smoke suite
npm run test:e2e:ui        # interactive runner (debug selectors)
```

`global-setup.ts` signs in via the Supabase API and seeds the session into
`e2e/.auth/state.json` (gitignored) — no login-modal automation, so the harness
doesn't break when the sign-in UI changes. With nothing configured, the run
fails fast with a clear message; `npx playwright test --list` works with no
secrets (handy for verifying the config parses).

## Wire into CI (after the account exists)

Keep this **separate from the deploy gate** so a missing test account never
blocks a deploy. Add a job to `.github/workflows/ci.yml` (only runs when the
secrets are present):

```yaml
  e2e-smoke:
    needs: ci
    if: ${{ github.event_name == 'push' && secrets.E2E_PASS != '' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          E2E_BASE_URL: https://steelbuild-pro.com
          E2E_USER: ${{ secrets.E2E_USER }}
          E2E_PASS: ${{ secrets.E2E_PASS }}
          E2E_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
          E2E_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with: { name: playwright-report, path: playwright-report/ }
```

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
