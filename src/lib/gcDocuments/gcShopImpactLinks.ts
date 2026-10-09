/**
 * Authoritative GC issuance -> shop drawing-set links. GC sheets and shop
 * sheets remain separate namespaces; a matching sheet number grants nothing.
 * Generated database types do not include this unapplied candidate yet, so
 * this file contains the narrow typed boundary until types are regenerated.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { postgrestErrorMessage } from "@/lib/postgrestErrors";
import { fetchAllRows } from "@/lib/pagedQuery";

export interface GcShopImpactLink {
  id: string;
  project_id: string;
  gc_drawing_set_id: string;
  drawing_set_id: string;
  created_by: string | null;
  created_at: string;
}

export interface ReplaceGcShopImpactResponse {
  project_id: string;
  gc_drawing_set_id: string;
  shop_set_ids: string[];
  added_count: number;
  removed_count: number;
  unchanged: boolean;
}

type GcShopLinkDatabase = {
  public: {
    Tables: {
      gc_issuance_shop_sets: {
        Row: GcShopImpactLink;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const db = supabase as unknown as SupabaseClient<GcShopLinkDatabase>;
// The generated schema omits the candidate RPC until application. Give this
// one call its exact contract rather than pretending the function already
// exists in generated types or weakening the rest of the data client.
const replaceRpc = supabase.rpc as unknown as (
  name: "replace_gc_issuance_shop_set_links",
  args: { p_project_id: string; p_gc_drawing_set_id: string; p_shop_set_ids: string[] },
) => Promise<{ data: ReplaceGcShopImpactResponse | null; error: PostgrestError | null }>;
export async function fetchGcShopImpactLinks(projectId: string): Promise<GcShopImpactLink[]> {
  if (!projectId) throw new Error("Select a project before reading affected shop sets.");
  try {
    return await fetchAllRows<GcShopImpactLink>(async (from, to) => {
      // fetchAllRows bounds requests and rejects an incomplete or stuck read.
      // eslint-disable-next-line no-restricted-syntax
      const { data, error } = await db
        .from("gc_issuance_shop_sets")
        .select("id,project_id,gc_drawing_set_id,drawing_set_id,created_by,created_at")
        .eq("project_id", projectId)
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }, "affected shop-set links");
  } catch (error) {
    throw new Error(`Affected shop-set links are unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function replaceGcShopImpactLinks(
  projectId: string,
  gcIssuanceId: string,
  shopSetIds: readonly string[],
): Promise<ReplaceGcShopImpactResponse> {
  if (!projectId || !gcIssuanceId || shopSetIds.some((id) => !id)) {
    throw new Error("Choose a project, issuance, and valid shop drawing sets.");
  }
  if (new Set(shopSetIds).size !== shopSetIds.length) {
    throw new Error("The affected shop-set selection contains duplicates.");
  }
  const { data, error } = await replaceRpc("replace_gc_issuance_shop_set_links", {
    p_project_id: projectId,
    p_gc_drawing_set_id: gcIssuanceId,
    p_shop_set_ids: [...shopSetIds],
  });
  if (error) throw new Error(`Affected shop-set links were not saved: ${postgrestErrorMessage(error)}`);
  const response = data as ReplaceGcShopImpactResponse | null;
  if (!response || response.project_id !== projectId
    || response.gc_drawing_set_id !== gcIssuanceId
    || !Array.isArray(response.shop_set_ids)
    || response.shop_set_ids.length !== shopSetIds.length
    || new Set(response.shop_set_ids).size !== response.shop_set_ids.length
    || !shopSetIds.every((id) => response.shop_set_ids.includes(id))
    || !Number.isInteger(response.added_count)
    || response.added_count < 0
    || !Number.isInteger(response.removed_count)
    || response.removed_count < 0
    || typeof response.unchanged !== "boolean"
    || response.unchanged !== (response.added_count === 0 && response.removed_count === 0)) {
    throw new Error("The server did not confirm the exact affected shop-set selection.");
  }
  return response;
}
