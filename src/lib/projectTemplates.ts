/**
 * projectTemplates.ts — client access to the project workflow templates RPC
 * (migration 20260819003000). Templates are code-defined in SQL; this module
 * owns the catalog metadata the UI shows and the typed call wrapper.
 */

import { supabase } from "@/lib/supabase";

export interface ProjectTemplateSummary {
  template: string;
  work_packages: number;
  schedule_tasks: number;
}

export const PROJECT_TEMPLATES = [
  {
    key: "standard_steel",
    name: "Standard Structural Steel",
    description:
      "Two-sequence structural job: work-package skeleton (anchor bolts, main steel seq 1–2, misc metals, joists & deck) plus a milestone-bracketed schedule from detailing through erection, offset from the project start date.",
  },
] as const;

export type ProjectTemplateKey = (typeof PROJECT_TEMPLATES)[number]["key"];

/**
 * Apply a workflow template to a FRESH project (PM+; the RPC fails closed if
 * the project already has live work packages or schedule tasks).
 */
export async function applyProjectTemplate(
  projectId: string,
  templateKey: ProjectTemplateKey = "standard_steel",
): Promise<ProjectTemplateSummary> {
  // Untyped rpc call — apply_project_template isn't in the generated DB types
  // yet (same pattern as src/lib/org/repository.ts callRpc).
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("apply_project_template", {
    p_project_id: projectId,
    p_template_key: templateKey,
  });
  if (error) throw new Error(error.message || "Failed to apply project template");
  return data as ProjectTemplateSummary;
}
