/**
 * submittalAgingTriggers.ts — Critical R&R/OFS/BFA aging → ActionItem drafts.
 *
 * Honest notifications path for Slice 7: create (at most) one Open ActionItem
 * per critical package. Never invents Alerts Center rows or a generate-alerts
 * Edge Function. Failures are swallowed so page loads stay resilient.
 */
import { entities } from "@/api/supabaseClient";
import { submittalStatusToStage } from "@/lib/submittalStageMapping";
import { computeSubmittalRiskAging } from "@/lib/submittalRiskAging";

export interface AgingTriggerSubmittal {
  id: string;
  project_id: string;
  project_name?: string | null;
  submittal_number?: string | null;
  title?: string | null;
  status?: string | null;
  ball_in_court?: string | null;
  approved_date?: string | null;
  required_date?: string | null;
  due_date?: string | null;
  returned_date?: string | null;
  updated_at?: string | null;
  submitted_date?: string | null;
  is_deleted?: boolean | null;
}

export interface AgingActionSpec {
  submittalId: string;
  triggerKey: string;
  title: string;
  description: string;
  priority: "High";
  stage: string;
  reason: string;
}

/** Pure: which critical aging ActionItems should exist for these submittals. */
export function computeCriticalAgingActions(
  submittals: AgingTriggerSubmittal[] | null | undefined,
  today?: string,
): AgingActionSpec[] {
  if (!Array.isArray(submittals)) return [];
  const out: AgingActionSpec[] = [];
  for (const sub of submittals) {
    if (!sub?.id || !sub.project_id || sub.is_deleted) continue;
    const stage = submittalStatusToStage(sub.status, sub.ball_in_court, sub.approved_date);
    const risk = computeSubmittalRiskAging({
      stage,
      dueDate: sub.required_date || sub.due_date || null,
      statusChangedAt:
        sub.returned_date || sub.approved_date || sub.updated_at || sub.submitted_date || null,
      today,
      useWorkdays: true,
    });
    if (!risk || risk.tier !== "critical") continue;
    const label = [sub.submittal_number, sub.title].filter(Boolean).join(" — ") || "submittal";
    out.push({
      submittalId: sub.id,
      triggerKey: `submittal:${sub.id}:aging-critical:${stage}`,
      title: `Critical ${stage} aging: ${label}`.slice(0, 220),
      description: [
        `Auto-created by submittal aging scan (Slice 7).`,
        `Stage: ${stage}`,
        `Risk: ${risk.reason}`,
        sub.required_date ? `Required date: ${sub.required_date}` : null,
        sub.ball_in_court ? `Ball in court: ${sub.ball_in_court}` : null,
        `Take the next workflow action before fabrication exposure grows.`,
      ]
        .filter(Boolean)
        .join("\n"),
      priority: "High",
      stage: stage!,
      reason: risk.reason,
    });
  }
  return out;
}

/**
 * Ensure Open ActionItems exist for Critical R&R/OFS/BFA aging.
 * Deduped via metadata.trigger_key. Never throws.
 */
export async function ensureCriticalAgingActionItems(
  submittals: AgingTriggerSubmittal[],
): Promise<number> {
  try {
    const specs = computeCriticalAgingActions(submittals);
    if (specs.length === 0) return 0;

    const byProject = new Map<string, AgingTriggerSubmittal[]>();
    for (const sub of submittals) {
      if (!sub?.project_id) continue;
      const list = byProject.get(sub.project_id) ?? [];
      list.push(sub);
      byProject.set(sub.project_id, list);
    }

    let created = 0;
    for (const [projectId, projectSubs] of byProject) {
      const projectSpecs = specs.filter((s) =>
        projectSubs.some((sub) => sub.id === s.submittalId),
      );
      if (projectSpecs.length === 0) continue;

      const openItems = await entities.ActionItem.filter({
        project_id: projectId,
        status: "Open",
      });
      const existingKeys = new Set(
        (openItems || [])
          .map((item: any) => item?.metadata?.trigger_key)
          .filter(Boolean),
      );

      for (const spec of projectSpecs) {
        if (existingKeys.has(spec.triggerKey)) continue;
        const sub = projectSubs.find((row) => row.id === spec.submittalId);
        if (!sub) continue;
        await entities.ActionItem.create({
          project_id: projectId,
          project_name: sub.project_name || null,
          title: spec.title,
          description: spec.description,
          status: "Open",
          priority: spec.priority,
          assigned_to: "Detailer",
          metadata: {
            trigger_key: spec.triggerKey,
            source: "submittal-aging-critical",
            submittal_id: spec.submittalId,
            stage: spec.stage,
            reason: spec.reason,
          },
        });
        existingKeys.add(spec.triggerKey);
        created += 1;
      }
    }
    return created;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[submittalAgingTriggers] Failed to ensure aging action items:", err);
    return 0;
  }
}
