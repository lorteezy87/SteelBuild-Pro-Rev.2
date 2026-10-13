/**
 * useFeatureFlag.ts — homegrown Supabase-backed feature-flag hook.
 *
 * Reads caller-effective values through `get_my_feature_flags()` and exposes
 * a Map of flag_key → enabled. The server resolves per-user overrides without
 * sending any override email addresses to ordinary browser sessions.
 *
 * Loads default to `false` so a UI gated on a flag never flashes the
 * feature on before the network responds.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { type FeatureFlagKey } from "@/config/featureFlags";

const STALE_TIME = 60_000;

/** Privacy-safe row returned by get_my_feature_flags(). */
export type EffectiveFeatureFlagRow = {
  flag_key: string;
  enabled: boolean | null;
};

export function mapEffectiveFlags(
  rows: ReadonlyArray<EffectiveFeatureFlagRow>,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const r of rows) {
    if (!r || typeof r.flag_key !== "string" || !r.flag_key) continue;
    out.set(r.flag_key, r.enabled === true);
  }
  return out;
}

export async function fetchEffectiveFlags(): Promise<Map<string, boolean>> {
  const { data, error } = await supabase.rpc("get_my_feature_flags");
  if (error) throw error;
  return mapEffectiveFlags(data ?? []);
}

/** All flags as a Map<key, enabled> for the current user. */
export function useAllFlags() {
  const { user } = useAppSecurity();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["feature_flags", userId],
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: Boolean(userId),
    queryFn: fetchEffectiveFlags,
  });
}

/** True if the named flag is enabled for the current user (defaults to false on load). */
export function useFlag(key: FeatureFlagKey): boolean {
  const { data, isSuccess } = useAllFlags();
  if (!isSuccess) return false;
  return data?.get(key) === true;
}
