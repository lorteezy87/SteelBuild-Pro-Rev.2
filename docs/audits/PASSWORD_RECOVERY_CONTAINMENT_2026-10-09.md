# Password recovery containment — 2026-10-09

Status: source verified; not yet deployed or accepted against hosted recovery email/MFA.

## Change

Password-reset sessions retain a recovery marker across reloads, token renewal and tabs. Failed or pending sign-out retains the recovery screen; successful password updates require confirmed sign-out before normal navigation resumes. Enrolled MFA runs before the reset form. Ordinary Settings password rotation remains signed in.

This ports the ten recovery implementation/test files from committed source `037e3b0fd9149f0f351d8eea1ec530598f43974b`, then corrects a race found during independent review: an older sign-out request could emit `SIGNED_OUT` after a newer recovery session arrived and clear the newer hold. Sign-out now captures the identity, token and exact recovery snapshot; late events cannot clear a replacement session or marker. No access token is persisted in the recovery marker.

This is client workflow containment. Supabase recovery access tokens remain ordinary authenticated sessions; this change does not create a database authorization restriction on recovery tokens.

## Verification

- Before port: the app-gate regression failed because recovery preceded the enrolled-MFA gate.
- After the initial port: 52 tests across five files passed.
- Independent review reproduced the delayed `SIGNED_OUT` race: the regression failed with recovery cleared and project routes exposed.
- After the race correction: 54 tests across those five files passed, including same-user replacement tokens and a different-user recovery. Conflicting identity markers remain unresolved and block project routes.
- Scoped ESLint and `git diff --check` passed. Full CI remains required before integration.

Run:

```sh
node node_modules/vitest/vitest.mjs run src/boot/__tests__/AuthenticatedApp.test.jsx src/lib/__tests__/AuthContext.passwordRecovery.test.tsx src/lib/__tests__/passwordRecovery.test.ts src/lib/__tests__/supabase.passwordRecovery.test.ts src/components/shared/__tests__/useAppSecurity.test.tsx --maxWorkers=1
```

No live user credentials, sessions, password-reset messages or hosted configuration were changed for these tests. Hosted acceptance still needs recovery-link/reload, enrolled-MFA, password update, failed sign-out and fresh sign-in checks on staging before production readiness is asserted.
