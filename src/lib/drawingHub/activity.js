/**
 * drawingHub/activity.js — Zone activity-stream reads.
 *
 * Extracted from src/lib/drawingHub.js. Behavior + Supabase calls are
 * byte-identical to the original.
 */

import { supabase } from "@/lib/supabase";

/**
 * Fetch the activity stream for a zone (newest first). Joins a
 * best-effort actor email from `user_profiles` or `auth.users` if the
 * project has a profile table; otherwise returns just the actor_id.
 *
 * Uses Supabase's PostgREST directly rather than the base44 entity
 * wrapper because drawing_zone_activity is append-only (no update/
 * delete) and we want a bounded limit.
 */
export async function listZoneActivity(zoneId, { limit = 50 } = {}) {
  if (!zoneId) return [];
  const { data, error } = await supabase
    .from("drawing_zone_activity")
    .select("*")
    .eq("drawing_zone_id", zoneId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
