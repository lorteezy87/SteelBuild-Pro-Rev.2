import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/pagedQuery";
import type { Database } from "@/types/supabase";

type Comment = Database["public"]["Tables"]["comments"]["Row"];

export function fetchThreadComments(entityType: string, entityId: string): Promise<Comment[]> {
  if (!entityType || !entityId) return Promise.resolve([]);
  return fetchAllRows<Comment>(async (start, end) => {
    // eslint-disable-next-line no-restricted-syntax -- bounded page, with RLS and entity filters
    return await supabase.from("comments").select("*")
      .eq("entity_type", entityType).eq("entity_id", entityId).eq("is_deleted", false)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(start, end);
  }, "comments");
}
