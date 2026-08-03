# Task 4 Report — Planner auth, MFA, tenancy, and query boundary

## Result

Implemented the Planner auth boundary with the existing SteelBuild `AuthProvider`, password operations, MFA challenge, `OrgProvider`, `ProjectProvider`, and shared React Query client. The Planner has no separate auth listener or authorization path; existing Supabase RLS and organization/project boundaries remain authoritative.

At the task-owner's direction, the initially empty local route placeholder was replaced with the smallest real `PlannerRoutes` boundary: the existing Planner identity at `/` and a safe not-found route. It is intentionally ready for later Planner pages to extend.

No files were staged, committed, pushed, deployed, or migrated.

## TDD evidence

### RED — missing auth boundary

Command:

```powershell
npx vitest run planner/src/app/__tests__/PlannerAuthGate.test.tsx
```

Result before implementation: failed as expected because `../PlannerAuthGate` could not be resolved.

```text
Error: Failed to resolve import "../PlannerAuthGate"
```

### RED — identity-change cleanup was incomplete

The new integration test used the real shared `AuthProvider`, simulated a signed-in identity changing from `planner-user-a` to `planner-user-b`, and registered the Planner cleanup callback. With callback dispatch temporarily absent from the existing shared cleanup path, the test failed as intended:

```text
AssertionError: expected 'stale planner state' to be null
```

This proved React Query was already cleared by the existing auth code but Planner storage was not yet connected to the authoritative listener.

### GREEN

Command:

```powershell
npx vitest run planner/src/app/__tests__/PlannerAuthGate.test.tsx
```

Result: `1 passed`, `9 passed`.

The focused suite verifies loading, existing credential adapter, existing MFA challenge, explicit onboarding link, authorized child rendering, Planner-only storage clearing, real identity-change React Query + Planner cache clearing, home identity, and not-found routing.

## Validation

Commands:

```powershell
npm run test:planner
npm run typecheck:planner
git diff --check
```

Results:

```text
test:planner: 4 passed files, 24 passed tests
typecheck:planner: passed (tsc -p planner/tsconfig.json)
diff --check: passed
```

The existing Task 1 `PlannerApp` identity test was rerun as part of `npm run test:planner`. It is now isolated from environment-dependent shared authentication startup; the real auth boundary is covered in the dedicated gate suite.

The raw command `npx vitest run planner/src/app/__tests__/PlannerApp.test.tsx` remains incompatible with Task 1's existing `@planner/*` test import because it does not load `planner/vite.config.ts`. The Planner test script is the configured, passing command and uses that alias. The Task 4 brief's raw command passes because its test uses relative Planner-local imports.

## Files changed

- `planner/src/app/PlannerAuthGate.tsx`
- `planner/src/app/PlannerApp.tsx`
- `planner/src/app/PlannerRoutes.tsx`
- `planner/src/app/__tests__/PlannerAuthGate.test.tsx`
- `planner/src/app/__tests__/PlannerApp.test.tsx`
- `src/lib/AuthContext.tsx` — the only shared file touched; exports `registerTenantClientStateCleanup` and dispatches registered callbacks from its existing identity cleanup path.
- `.superpowers/sdd/steelbuild-planner-core-implementation-plan/task-4-report.md`

## Design and limits

- Auth precedence preserves the established SteelBuild flow: password recovery, MFA, loading, credential form, then organization/project access.
- The no-organization state links to the existing main-app `/Onboarding` route; it does not create a separate tenant onboarding implementation.
- `clearPlannerTenantStorage` removes only keys with the `sbp:planner:` prefix. The shared cleanup continues to clear React Query, Field outbox state, and pending photo blobs as before.
- Planner routes are deliberately limited to `/` and the safe fallback until later page tasks provide operational UI. No data reads, writes, phase behavior, or migrations were added by this task.

## Fix Round 1

### Result

- The no-organization link is now an external, full-page anchor to the main SteelBuild application, never the separate Planner origin. `planner/src/app/plannerAppUrl.ts` reads `VITE_STEELBUILD_APP_URL`, removes trailing slashes, and falls back to the repository-confirmed production origin `https://steelbuild-pro.com`. The rendered fallback destination is `https://steelbuild-pro.com/Onboarding`.
- Password recovery is explicitly pinned above MFA, loading, and the credential adapter.
- The existing shared `AuthProvider` identity listener is now regression-covered for both identity replacement and `SIGNED_OUT`: it clears React Query and registered Planner state, while unrelated local storage remains untouched.

### RED evidence

1. The initial URL-helper test failed because the requested Planner-local helper did not yet exist:

```text
Error: Failed to resolve import "../plannerAppUrl"
```

2. With recovery intentionally moved below MFA, the precedence test failed with the MFA challenge in the DOM and no password-recovery view:

```text
Unable to find an element with the text: SteelBuild password recovery
SteelBuild MFA challenge
```

3. With the existing shared signed-out cleanup call intentionally omitted, the real `AuthProvider` event test failed:

```text
AssertionError: expected "clear" to be called 2 times, but got 1 times
```

### GREEN validation

Commands:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/app/__tests__/PlannerAuthGate.test.tsx
npm run test:planner
npm run typecheck:planner
```

Results:

```text
PlannerAuthGate: 1 passed file, 11 passed tests
Planner suite: 4 passed files, 26 passed tests
Planner typecheck: passed
```

The configured Planner Vitest command is required because production Planner imports use the mandated `@planner/*` alias. The unconfigured raw Vitest command does not load `planner/vite.config.ts` and therefore cannot resolve that alias.

### Fix Round 1 files

- `planner/src/app/plannerAppUrl.ts`
- `planner/src/app/PlannerAuthGate.tsx`
- `planner/src/app/__tests__/PlannerAuthGate.test.tsx`
- `.superpowers/sdd/steelbuild-planner-core-implementation-plan/task-4-report.md`

## Fix Round 2

### Result

`VITE_STEELBUILD_APP_URL` is now parsed with `new URL()` and accepted only for `http:` or `https:` values. The Planner retains only `URL.origin`; paths, queries, fragments, credentials, malformed values, and non-web protocols cannot influence the main-app onboarding destination. Blank or invalid configuration falls back to `https://steelbuild-pro.com`.

The no-organization gate constructs its native external anchor at render time through the same helper, so configured test values exercise the actual rendered `href` rather than only a pure helper.

### TDD evidence

RED command:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/app/__tests__/PlannerAuthGate.test.tsx
```

RED result: 3 expected failures.

```text
Expected: https://planner-staging.example.com
Received: https://planner-staging.example.com/app/?preview=true#onboarding

Expected: https://steelbuild-pro.com
Received: not a url

Expected href: https://planner-staging.example.com/Onboarding
Received href: https://steelbuild-pro.com/Onboarding
```

GREEN validation:

```powershell
npx vitest run --config planner/vite.config.ts planner/src/app/__tests__/PlannerAuthGate.test.tsx
npm run test:planner
npm run typecheck:planner
git diff --check
```

```text
PlannerAuthGate: 1 passed file, 14 passed tests
Planner suite: 4 passed files, 29 passed tests
Planner typecheck: passed
diff check: passed
```

The added tests cover origin extraction from a path/query/fragment value, malformed and `javascript:` fallback behavior, and the actual no-org gate anchor using a configured path/query value.

### Fix Round 2 files

- `planner/src/app/plannerAppUrl.ts`
- `planner/src/app/PlannerAuthGate.tsx`
- `planner/src/app/__tests__/PlannerAuthGate.test.tsx`
- `.superpowers/sdd/steelbuild-planner-core-implementation-plan/task-4-report.md`
