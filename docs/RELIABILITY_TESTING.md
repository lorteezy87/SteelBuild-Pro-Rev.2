# Reliability testing harness

This is the automated safety net for the workflows a paying customer touches
first and most: **file imports**, the **boot/tenancy gate**, and **billing
entitlements**. Everything here runs in the existing Vitest suite (`npm test`),
so CI already gates every deploy on it — no extra runner, no browser download.

## What's covered

| Surface | Test | Why it matters |
| --- | --- | --- |
| Drawing Log import (the moat) | `src/components/drawings/__tests__/DrawingLogImportModal.test.jsx` | Upload → SheetJS parse → staged review → commit, end to end, with Supabase mocked. Asserts the set + sheets actually get created with the parsed fields. |
| Production Status import (Tekla EPM / FabSuite) | `src/components/production/__tests__/ProductionStatusImportModal.test.jsx` | Same flow for the Phase-4 CSV importer; asserts the exact `(projectId, rows)` payload and that "Welding" resolves to the **Weld** stage (not Shipped). |
| Auth + org gate (multi-tenant boot) | `src/boot/__tests__/AuthenticatedApp.test.jsx` | Pins the precedence loading → Landing → onboarding → app, and the **fail-open** rule (an org-fetch error must render the app, never trap a paying user on onboarding). A regression here is a white-screen. |
| Billing entitlements | `src/lib/billing/__tests__/plans.test.ts` | `planFor` never throws / never returns undefined; `withinLimit` boundary math; the purchasable/highlight invariants the Billing UI relies on. |

## The import-flow integration pattern (how to add another importer)

The importers are the product's moat, so each one earns an integration test that
drives the **real** modal. Template:

1. `// @vitest-environment jsdom` at the top.
2. Mock only the **write** boundary (the repository fn or the `entities`
   surface) and `sonner` — let the real parser run on a real fixture string.
3. Build the fixture `File` with a pinned reader, because jsdom's
   `File.arrayBuffer()` / `File.text()` are unreliable across versions:
   ```js
   function csvFile(text, name) {
     const file = new File([text], name, { type: "text/csv" });
     file.arrayBuffer = async () => new TextEncoder().encode(text).buffer; // modals using XLSX.read
     file.text = async () => text;                                         // modals using file.text()
     return file;
   }
   ```
4. Drive it with `@testing-library/user-event`: `await user.upload(input, file)`
   then click the review/import buttons by role+name.
5. Assert the staged review renders the rows **and** the commit boundary is
   called with the right payload. Remember commits often run via
   `Promise.allSettled` — match rows by key, not by call order.

Confirm field names against the parser/sanitizer before asserting them (e.g. the
drawing sanitizer is a `{ ...raw }` pass-through; the production parser stores the
resolved stage in `status`, not `stage`).

## Not yet here: full-browser E2E

These are jsdom integration tests — they verify the React wiring + parse/commit
logic, not a real browser against the live stack. A true browser E2E
(`@playwright/test`) is the next layer and was deliberately deferred because it
needs:

- a new dev dependency + a browser download (and a CI runner step), and
- a **seeded test user** — the app has no self-signup, so an authed flow can't
  provision its own session, and pointing it at the production Supabase would
  write test data into the real DB.

`ci.yml` already reserves a non-blocking `npm run test:e2e` job for when that
lands. The recommended first Playwright spec is the unauthenticated boot smoke
(app loads, Landing renders, no console errors), then an authed
login → create-project → import flow once a dedicated test project (ideally a
separate Supabase project) exists.
