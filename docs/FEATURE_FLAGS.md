# Feature Flag Authority

## Source-of-truth

- Runtime flag state is authoritative only in `public.feature_flags` in Supabase.
- Browser-local systems (`localStorage`, query-string `ff_*` flags, and
  `FeatureFlagProvider`/`useFeatureFlags` context patterns) are not production
  authority and must not be used for rollout decisions.

## Production flag catalog

- Production flag keys are defined in a TypeScript catalog:
  `src/config/featureFlags.ts` (`FEATURE_FLAG_KEYS`, `FeatureFlagKey`).
- The production SQL catalog seed migration is:
  `supabase/migrations/20260712000000_seed_feature_flag_catalog.sql`.
- `useFeatureFlag.ts` resolves runtime checks only from Supabase rows and
  accepts `FeatureFlagKey` for typed, production key usage.

## Rollout governance

- Global enablement (`feature_flags.enabled`) and `user_overrides` are
  administrator-managed environment state.
- Personal email addresses must not be committed in seed migrations.
- `user_overrides` should only be managed as operational state through
  controlled database updates by admins.
- Migrations that seed/seed-upgrade flags must use
  `ON CONFLICT (flag_key) DO UPDATE SET description = EXCLUDED.description`
  and avoid mutating existing `enabled` or `user_overrides` values.

## Validation expectations

- `useFlag` defaults to `false` until the Supabase query resolves.
- Per-user overrides are resolved case-insensitively.
- Personal overrides left in source control are treated as a policy violation.

