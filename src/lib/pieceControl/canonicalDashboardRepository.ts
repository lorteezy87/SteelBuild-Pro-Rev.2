import { supabase } from "@/lib/supabase";
import type {
  CanonicalRollupPiece,
  CanonicalWorkPackage,
} from "./canonicalRollups";
import type {
  StationCompletion,
  StationConfiguration,
} from "./stationProgress";

export interface LegacyProductionRow {
  id: string;
  quantity: number | null;
  weight: number | null;
  status: string | null;
  ship_date: string | null;
}

export interface CanonicalDashboardSnapshot {
  pieces: CanonicalRollupPiece[];
  workPackages: CanonicalWorkPackage[];
  stations: StationConfiguration[];
  completions: StationCompletion[];
  legacyProduction: LegacyProductionRow[];
}

export async function fetchCanonicalDashboardSnapshot(
  projectId: string,
): Promise<CanonicalDashboardSnapshot> {
  const db = supabase as any;
  const [pieces, workPackages, stations, completions, legacyProduction] =
    await Promise.all([
      db
        .from("pieces")
        .select("*")
        .eq("project_id", projectId)
        .order("normalized_piece_mark"),
      db
        .from("work_packages")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .is("deleted_at", null)
        .order("wp_number"),
      db
        .from("piece_station_configurations")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("sort_order"),
      db
        .from("piece_station_completions")
        .select("*")
        .eq("project_id", projectId),
      db
        .from("piece_production")
        .select("id,quantity,weight,status,ship_date")
        .eq("project_id", projectId)
        .eq("is_deleted", false),
    ]);

  for (const result of [
    pieces,
    workPackages,
    stations,
    completions,
    legacyProduction,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    pieces: pieces.data ?? [],
    workPackages: workPackages.data ?? [],
    stations: stations.data ?? [],
    completions: completions.data ?? [],
    legacyProduction: legacyProduction.data ?? [],
  };
}

