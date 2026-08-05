/**
 * useModuleAccess — resolves whether a page's module is enabled for the
 * current user, combining the scope-cut gate config (moduleGating.js) with
 * the Supabase-backed feature-flag system (useFeatureFlag.ts).
 *
 * Core (non-gated) pages are always enabled. Gated pages are enabled only
 * when their flag resolves true. While flags are still loading, gated pages
 * report `undefined` for "enabled" so callers can hold (show a loader)
 * rather than briefly redirect — see ModuleGate in AppRoutes.
 */

import { useCallback } from "react";
import { useAllFlags } from "@/hooks/useFeatureFlag";
import { PAGE_TO_GATE } from "@/config/moduleGating";

export function useModuleAccess() {
  const { data: flags, isLoading } = useAllFlags();

  // Non-gated → always true. Gated → flag value, or undefined while loading.
  const pageEnabled = useCallback((page) => {
    const gate = PAGE_TO_GATE[page];
    if (!gate) return true;
    if (isLoading && !flags) return undefined;
    return flags?.get(gate) === true;
  }, [flags, isLoading]);

  // Convenience boolean form for nav filtering: treat "loading" as hidden so
  // a gated link never flashes before the flag resolves.
  const isPageVisible = useCallback((page) => pageEnabled(page) === true, [pageEnabled]);

  return { pageEnabled, isPageVisible, isLoading, flags };
}
