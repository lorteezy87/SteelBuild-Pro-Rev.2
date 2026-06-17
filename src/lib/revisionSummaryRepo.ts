/**
 * revisionSummaryRepo.ts — persistence for the deterministic Revision Summary
 * digest (drawing_revision_summaries). The engine (lib/revisionSummary.js) stays
 * pure; this owns the I/O. Self-contained (imports supabase directly), matching
 * the backcharge / payapp / org repos. The table isn't in the generated types
 * yet, so `from` is cast at the boundary.
 */
import { supabase } from "@/lib/supabase";

const TABLE = "drawing_revision_summaries";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (): any => (supabase.from as unknown as (t: string) => any)(TABLE);

export interface SavedRevisionSummary {
  id: string;
  project_id: string;
  drawing_set_id: string | null;
  set_name: string | null;
  sheets_changed: number;
  high_risk_count: number;
  likely_rfi: boolean;
  impact_level: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any; // buildRevisionSummary() output
  generated_at: string;
  generated_by: string | null;
}

/** Persist a digest snapshot. Returns the inserted row (or null on bad input). */
export async function saveRevisionSummary(args: {
  projectId: string;
  drawingSetId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any;
  generatedBy?: string | null;
}): Promise<SavedRevisionSummary | null> {
  const { projectId, drawingSetId = null, summary, generatedBy = null } = args;
  if (!projectId || !summary) return null;
  const row = {
    project_id: projectId,
    drawing_set_id: drawingSetId || summary.setId || null,
    set_name: summary.setName || null,
    sheets_changed: summary.sheetsChanged || 0,
    high_risk_count: summary.highRiskCount || 0,
    likely_rfi: !!summary.likelyRfi?.needed,
    impact_level: summary.impact?.level || "low",
    summary,
    generated_by: generatedBy,
  };
  const { data, error } = await from().insert(row).select().single();
  if (error) throw error;
  return data as SavedRevisionSummary;
}

/**
 * Latest summary per drawing set for a project → Map keyed by drawing_set_id.
 * Feeds the "revised · N changes" badge on the Drawing Register.
 */
export async function getLatestSummariesByProject(projectId: string): Promise<Map<string, SavedRevisionSummary>> {
  const map = new Map<string, SavedRevisionSummary>();
  if (!projectId) return map;
  const { data, error } = await from()
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("generated_at", { ascending: false });
  if (error) throw error;
  for (const r of (data || []) as SavedRevisionSummary[]) {
    const key = r.drawing_set_id || "";
    if (key && !map.has(key)) map.set(key, r); // first row per set is the newest
  }
  return map;
}
