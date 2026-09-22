import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/pagedQuery";
import type { Database } from "@/types/supabase";

type Project = Database["public"]["Tables"]["projects"]["Row"];

/** Include on-hold projects; project membership is enforced by RLS. */
export function fetchProjectRegister(): Promise<Project[]> {
  return fetchAllRows<Project>(async (start, end) => {
    // eslint-disable-next-line no-restricted-syntax -- bounded page with a unique ordering
    return await supabase.from("projects").select("*").eq("is_deleted", false)
      .order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(start, end);
  }, "projects");
}
