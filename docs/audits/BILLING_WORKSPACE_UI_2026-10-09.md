# Billing workspace UI acceptance — 2026-10-09

## Corrected behavior

- A `?status=success` URL is only a return hint. It displays a neutral confirmation-pending notice and refreshes organization state. It never announces activation or changes entitlements. Existing organization plan/subscription fields remain authoritative. Other query parameters, the URL fragment, and router history state are retained.
- Project usage requests an exact PostgREST HEAD count with an explicit organization predicate and `is_deleted IS NULL OR is_deleted=false`, matching the server's nondeleted project definition. It returns no project rows and is not limited by the 1,000-row page cap. Its cache includes workspace and role. Failed or unavailable reads show an unknown count. Ordinary members see an explicitly labeled accessible-project subset without a misleading workspace remaining-capacity claim.
- Checkout and portal actions retain the initiating workspace generation, authority, native mode, component lifetime and operation identity. Reopening A after visiting B does not restore an old request's authority. Stale successes cannot navigate; stale failures cannot toast or clear a newer request's busy state. A synchronous lock prevents rapid checkout/portal callbacks before disabled controls commit.
- Native builds retain their sign-in-only purchase restrictions in both the rendered UI and action hook.

## Verification

Eight executable page regressions failed on the original source: forged activation notice, shared project cache, unavailable usage, both checkout/portal A-to-B-to-A failures, old/new operation state, action locking, and unmount notification. All eight pass after the fix.

The focused source suite passed **64 tests across five files**, covering page regressions, native purchase gating, successful/obsolete redirects, role revocation, sign-out, unmount, delayed return refresh, exact counts (including a 2,001-project result), unavailable counts, and member/owner KPI semantics. The initial red run used a temporary minimal Vitest config to work around a local cold-start stall; the final green run used the repository's normal Vite/Vitest configuration with one worker. No temporary config is committed.

Full application/type/build checks run in hosted CI on the exact committed source. This change does not apply SQL, deploy a function, complete provider test-mode acceptance, create a paid subscription, or audit historical Stripe duplicates.

Reference: [Stripe Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal) identifies webhooks as the source of subscription updates and requires caller authentication before creating portal sessions.
