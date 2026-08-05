import { PHASES } from "@/utils/phases";

export function normalizeSchedulePhase(value: string | null | undefined): string {
  return value && PHASES.includes(value) ? value : "all";
}

/** KPI phase tile counts: all + each PHASES value. */
export function computePhaseCounts(
  scheduleTasks: Array<{ phase?: string | null }>,
): Record<string, number> {
  const m: Record<string, number> = { all: (scheduleTasks || []).length };
  for (const phase of PHASES) {
    m[phase] = (scheduleTasks || []).filter((task) => task.phase === phase).length;
  }
  return m;
}

/** Documents that are submittals linked to a work package (Gantt overlay). */
export function selectLinkedSubmittalDocs<T extends { is_submittal?: boolean | null; linked_wp_id?: string | null }>(
  docs: T[],
): T[] {
  return (docs || []).filter((d) => d.is_submittal && d.linked_wp_id);
}
