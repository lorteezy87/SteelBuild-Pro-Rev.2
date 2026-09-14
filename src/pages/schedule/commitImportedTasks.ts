/**
 * Shared write path for schedule imports (MS Project XML + CSV).
 *
 * Creates every parsed row in outline order so parent_task_id can point at
 * already-inserted summaries, then second-pass-writes predecessor links
 * once every UID has a database id. Extracted from handleImportMpp so the
 * CSV preview modal reuses the exact same insert + link semantics.
 */
import type { QueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { PHASES } from "@/utils/phases";
import { batchProcess } from "@/utils/batchProcess";
import { invalidateEntity } from "@/services/cacheRegistry";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { generateWBS } from "./wbs";
import {
  PHASE_NAME_MAP,
  deriveMppDependencies,
  deriveParentUids,
  derivePhaseFromHierarchy,
  inferTaskType,
} from "./mppImport";
import { assertScheduleDateRange } from "./scheduleDateValidation";
import type { ParsedMppTask, ScheduleTask } from "./types";

export interface CommitImportedTasksOpts {
  tasks: ParsedMppTask[];
  projectId: string;
  qc: QueryClient;
  /** Fill empty WBS codes with generateWBS — CSV rows often omit Outline Number. */
  generateMissingWbs?: boolean;
  existingTasks?: ScheduleTask[];
}

export async function commitImportedScheduleTasks({
  tasks: allParsed,
  projectId,
  qc,
  generateMissingWbs = false,
  existingTasks = [],
}: CommitImportedTasksOpts): Promise<{ created: number }> {
  if (!allParsed.length) {
    throw new Error("No tasks to import.");
  }

  allParsed.forEach((task) => assertScheduleDateRange({
    start_date: task.start ?? null,
    end_date: task.finish ?? task.start ?? null,
  }));

  const uidToDbId: Record<string, string> = {};
  const uidToParentUid = deriveParentUids(allParsed);
  const snapshot: ScheduleTask[] = [...existingTasks];

  for (const t of allParsed) {
    const phaseName = t.phaseHint || derivePhaseFromHierarchy(t, allParsed);
    const mapped = PHASE_NAME_MAP[String(phaseName || "").toUpperCase()] || phaseName || "Fabrication";
    const phase = PHASES.includes(mapped) ? mapped : "Fabrication";

    const parentUid = uidToParentUid[t.uid];
    const parentDbId = parentUid ? uidToDbId[parentUid] : null;
    const wbs = t.outlineNumber || (generateMissingWbs ? generateWBS(phase, snapshot) : null);

    const status = t.statusHint
      || (t.pct >= 100 ? "Complete" : t.pct > 0 ? "In Progress" : "Not Started");

    const record = await entities.ScheduleTask.create(withProjectId({
      task_name: t.name,
      task_type: inferTaskType(t.name, t.isSummary, t.milestone),
      phase,
      start_date: t.start ?? null,
      end_date: t.finish ?? t.start ?? null,
      status,
      percent_complete: t.pct,
      priority: "Normal",
      milestone: t.milestone,
      wbs_code: wbs,
      outline_level: t.outlineLevel,
      duration: t.durationDays,
      resource_names: t.resources.length > 0 ? t.resources.join(", ") : null,
      parent_task_id: parentDbId,
      notes: t.notes || null,
      is_summary: t.isSummary || false,
    }, projectId) as any) as { id: string };

    uidToDbId[t.uid] = record.id;
    snapshot.push({ id: record.id, phase, wbs_code: wbs } as ScheduleTask);
  }

  const depItems = deriveMppDependencies(allParsed, uidToDbId);
  if (depItems.length > 0) {
    await batchProcess(
      depItems,
      ({ dbId, predLinks }: { dbId: string; predLinks: Array<{ id: string; type: string; lag_days: number }> }) =>
        entities.ScheduleTask.update(dbId, {
          dependencies: JSON.stringify(predLinks),
        }),
    );
  }

  invalidateEntity(qc, "schedule_task", projectId);
  return { created: Object.keys(uidToDbId).length };
}
