import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/pagedQuery";
import type { Database } from "@/types/supabase";

type Project = Database["public"]["Tables"]["projects"]["Row"];

/** Include on-hold projects within the selected workspace; RLS still applies. */
export function fetchProjectRegister(orgId: string): Promise<Project[]> {
  if (!orgId) return Promise.resolve([]);
  return fetchAllRows<Project>(async (start, end) => {
    // eslint-disable-next-line no-restricted-syntax -- bounded page with a unique ordering
    return await supabase.from("projects").select("*").eq("is_deleted", false).eq("org_id", orgId)
      .order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(start, end);
  }, "projects");
}
