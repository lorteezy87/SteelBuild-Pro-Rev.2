# E2E smoke tests (Playwright)

The **"unit tests pass ≠ it works"** safety layer. The Vitest suite + production
build can be green while the real signed-in workflow is broken (stale data,
RLS rejections, a wiring/async bug — the kind of failure only runtime shows).
These specs sign in with a real session and assert the daily-driver registers
(**drawings → submittals → RFIs**) actually render.

They are **read-only** — they navigate and assert; they never create, edit, or
delete project data.

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
  (`ExportFabReleaseModal`), not a route — a deeper, mutation-aware spec that
  exercises the gate is the natural next layer (run it against a **test org**
  only, since it writes).
