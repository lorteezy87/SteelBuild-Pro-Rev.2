# Function search-path verification

Run `npm ci --prefix supabase/tests/function-search-path --ignore-scripts`, then
`npm test --prefix supabase/tests/function-search-path` from the repository root.
CI runs both commands before the production build.

The test uses pinned PGlite 0.5.8 (PostgreSQL in WebAssembly), an in-memory database
and a read-only snapshot of eight pure SQL helper definitions from production on
2026-09-11. It contains no application records, auth tokens or external requests.
This dependency is isolated from the application's root package and bundle.

The migration pins an empty search path for those exact helper signatures. It
preserves bodies, grants, volatility and SECURITY INVOKER behavior. Missing module
helpers are skipped to support Rev 2-only replay. Existing definitions must match
the reviewed SHA-256 body fingerprint; a changed body or security mode aborts the
entire migration instead of modifying an unreviewed function.

Verification covers 3,929 result cases before and after, a caller-controlled
`btrim` override that changes a submittal classification before hardening but not
after, repeated application, absent modules and atomic rejection of a changed
definition. This is focused PostgreSQL verification, not a complete Supabase
schema replay or authenticated application acceptance.

The migration has not been applied to production. Before application, compare
the current definitions with the reviewed snapshot and verify an independent
database recovery point. The B2 storage backup only protects storage objects.
After application, rerun Supabase security advisors and confirm the eight
mutable-search-path notices are gone. No blanket grant changes are included.
