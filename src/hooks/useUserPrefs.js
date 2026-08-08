/**
 * Canonical read-side accessor for signed-in user preferences.
 * Authorization never comes from this data; the values are presentation-only
 * Supabase Auth metadata sanitized through the versioned preference contract.
 */
import { useContext, useMemo } from "react";
import { AuthContext } from "@/lib/AuthContext";
import {
  DASHBOARD_KPI_IDS,
  sanitizeUserPreferences,
} from "@/lib/userPreferences/schema";

export { DASHBOARD_KPI_IDS };

export function useUserPrefs() {
  const auth = useContext(AuthContext);
  return useMemo(() => sanitizeUserPreferences(auth?.user), [auth?.user]);
}

export function refetchIntervalFromPref(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return false;
  return n * 1000;
}
