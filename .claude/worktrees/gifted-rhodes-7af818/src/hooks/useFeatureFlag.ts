/**
 * useFeatureFlag.ts — homegrown Supabase-backed feature-flag hook.
 *
 * Reads `feature_flags` (migration 078) and exposes a per-user-resolved
 * Map of flag_key → enabled. Per-flag `user_overrides` (a JSON map of
 * { email: boolean }) takes precedence over the global `enabled` value
 * when the current user's email matches.
 *
 * Loads default to `false` so a UI gated on a flag never flashes the
 * feature on before the network responds.
 */

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAppSecurity } from "@/components/shared/useAppSecurity";

const STALE_TIME = 60_000;

/** Shape of a feature_flags row as far as the resolver cares. */
export type FeatureFlagRow = {
  flag_key: string;
  enabled: boolean | null;
  user_overrides?: unknown;
};

/**
 * Pure helper extracted so it can be unit-tested without mocking the entity
 * client. Resolves the per-user-effective `enabled` value for every row,
 * applying `user_overrides[email]` when present (booleans only — non-boolean
 * override values are ignored, falling back to the global flag).
 *
 * `email` is matched case-insensitively. Pass `null` to ignore overrides.
 */
export function resolveFlagsForEmail(
  rows: ReadonlyArray<FeatureFlagRow>,
  email: string | null,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const normalisedEmail = email ? email.toLowerCase() : null;
  for (const r of rows) {
    if (!r || typeof r.flag_key !== "string" || !r.flag_key) continue;
    const overrides =
      r.user_overrides && typeof r.user_overrides === "object" && !Array.isArray(r.user_overrides)
        ? (r.user_overrides as Record<string, unknown>)
        : {};
    let effective: boolean | undefined;
    if (normalisedEmail) {
      const candidate = overrides[normalisedEmail];
      if (typeof candidate === "boolean") {
        effective = candidate;
      } else {
        // Try an exact-case fallback in case overrides were stored
        // case-sensitively. Lowercase is canonical, so this is just a
        // belt-and-suspenders pass for legacy rows.
        for (const [k, v] of Object.entries(overrides)) {
          if (typeof v === "boolean" && k.toLowerCase() === normalisedEmail) {
            effective = v;
            break;
          }
        }
      }
    }
    if (typeof effective !== "boolean") effective = !!r.enabled;
    out.set(r.flag_key, effective);
  }
  return out;
}

/** All flags as a Map<key, enabled> for the current user. */
export function useAllFlags() {
  const { user } = useAppSecurity();
  const email = user?.email?.toLowerCase() || null;
  return useQuery({
    queryKey: ["feature_flags", email],
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const rows = (await base44.entities.FeatureFlag.list()) as unknown as FeatureFlagRow[];
      return resolveFlagsForEmail(rows, email);
    },
  });
}

/** True if the named flag is enabled for the current user (defaults to false on load). */
export function useFlag(key: string): boolean {
  const { data } = useAllFlags();
  return data?.get(key) === true;
}
