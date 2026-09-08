/**
 * useDrawingHolds — sheet-level Holds & Blockers for a project: reason
 * required, full placed/released audit trail (migration 20260908045525).
 *
 * drawing_holds is not a SOFT_DELETE_TABLES member (holds are released,
 * never deleted), so no is_deleted filtering is needed here.
 */
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export interface DrawingHoldRow {
  id: string;
  project_id: string;
  drawing_id: string;
  reason: string;
  prior_release_status: string | null;
  placed_by_id: string | null;
  placed_by_name: string | null;
  placed_at: string;
  is_active: boolean;
  released_by_id: string | null;
  released_by_name: string | null;
  released_at: string | null;
  release_notes: string | null;
  created_at: string;
}

export const DRAWING_HOLDS_QUERY_KEY = "drawing-holds";

export function useDrawingHolds(projectId: string | null) {
  return useQuery({
    queryKey: [DRAWING_HOLDS_QUERY_KEY, projectId],
    enabled: !!projectId,
    staleTime: 30_000,
    queryFn: async (): Promise<DrawingHoldRow[]> => {
      const rows = await entities.DrawingHold.filter({ project_id: projectId });
      return sortHoldsNewestFirst(rows as unknown as DrawingHoldRow[]);
    },
  });
}

/** Newest placed first; stable for equal timestamps. */
export function sortHoldsNewestFirst(holds: DrawingHoldRow[]): DrawingHoldRow[] {
  return holds
    .slice()
    .sort((a, b) => String(b.placed_at || "").localeCompare(String(a.placed_at || "")));
}

/** drawing_id → its single active hold, for O(1) badge lookups. */
export function activeHoldByDrawingId(holds: DrawingHoldRow[]): Map<string, DrawingHoldRow> {
  const map = new Map<string, DrawingHoldRow>();
  for (const hold of holds) {
    if (hold.is_active) map.set(hold.drawing_id, hold);
  }
  return map;
}
