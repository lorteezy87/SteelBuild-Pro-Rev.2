/**
 * useUserPrefs — single read-side accessor for the prefs the user
 * configures on Settings.
 *
 * The Settings tabs save prefs through `auth.updateMe(prefs)`,
 * which writes them onto Supabase auth's `user_metadata`. AuthContext
 * spreads that metadata onto the AppUser object on login, so every
 * pref is already reachable as `useAuth().user.<pref_key>` once the
 * session is hydrated. This hook centralises the lookup so consumers
 * don't have to remember which keys exist or what their defaults
 * look like.
 *
 * Today the wired-up prefs are:
 *   - default_project_id  → ProjectContext (initial active-project pick)
 *   - auto_refresh_secs   → Dashboard / ProjectDashboard (refetchInterval)
 *   - week_start          → ProjectCalendar / WeekView grids
 *
 * The other prefs persisted by Settings (date_format, time_format,
 * currency_format, number_format, measurement_units, notify_*,
 * quiet_hours_*, show_keyboard_hints, auto_open_drawers) currently
 * have no consumer. They're saved for forward-compat but the Settings
 * UI tags them as "Not yet active" so the user isn't misled.
 */

import { useContext, useMemo } from "react";
import { AuthContext } from "@/lib/AuthContext";

const DEFAULTS = {
  default_project_id: null,
  auto_refresh_secs: 0,         // 0 = off
  week_start: "sunday",         // sunday | monday
};

/**
 * Returns a stable object with the wired-up prefs filled in.
 * Components that need a one-off pref can also hit `useAuth().user.<key>`
 * directly; this hook just keeps defaults in one place.
 */
export function useUserPrefs() {
  const auth = useContext(AuthContext);
  const user = auth?.user;
  return useMemo(() => {
    if (!user) return { ...DEFAULTS };
    return {
      default_project_id:
        typeof user.default_project_id === "string" && user.default_project_id
          ? user.default_project_id
          : DEFAULTS.default_project_id,
      auto_refresh_secs:
        Number.isFinite(Number(user.auto_refresh_secs))
          ? Number(user.auto_refresh_secs)
          : DEFAULTS.auto_refresh_secs,
      week_start:
        user.week_start === "monday" || user.week_start === "sunday"
          ? user.week_start
          : DEFAULTS.week_start,
    };
  }, [user]);
}

/**
 * Convenience: convert the saved auto-refresh value into the
 * `refetchInterval` arg react-query expects. 0 → false (disabled),
 * anything else → milliseconds.
 */
export function refetchIntervalFromPref(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return false;
  return n * 1000;
}
