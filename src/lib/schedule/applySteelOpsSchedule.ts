import { computeCpmFloat, type CpmRow } from "./cpmFloat";
import { flagFloatProtection, type FloatFlag } from "./floatProtection";
import { computeInstallReadiness, type InstallReadiness } from "./installReadiness";
import { findLoadSequenceClashes, type LoadClash } from "./loadSequence";

export type SteelOpsScheduleOverlay = {
  tasks: Record<string, any>[];
  cpm: Map<string, CpmRow>;
  floatFlags: FloatFlag[];
  loadClashes: LoadClash[];
};

export function applySteelOpsSchedule(tasks: Record<string, any>[]): SteelOpsScheduleOverlay {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { tasks: [], cpm: new Map(), floatFlags: [], loadClashes: [] };
  }
  const cpm = computeCpmFloat(tasks);
  const floatFlags = flagFloatProtection(tasks, cpm);
  const loadClashes = findLoadSequenceClashes(tasks);
  const flagsByTask = new Map<string, FloatFlag[]>();
  for (const f of floatFlags) {
    flagsByTask.set(f.taskId, [...(flagsByTask.get(f.taskId) ?? []), f]);
  }
  const clashByTask = new Map<string, LoadClash[]>();
  for (const c of loadClashes) {
    clashByTask.set(c.shipTaskId, [...(clashByTask.get(c.shipTaskId) ?? []), c]);
    clashByTask.set(c.erectTaskId, [...(clashByTask.get(c.erectTaskId) ?? []), c]);
  }

  const overlaid = tasks.map((t) => {
    if (!t?.id) return t;
    const id = String(t.id);
    const row = cpm.get(id) || null;
    const readiness: InstallReadiness = computeInstallReadiness(t);
    return {
      ...t,
      _cpm: row,
      _floatFlags: flagsByTask.get(id) ?? [],
      _readiness: readiness,
      _loadClashes: clashByTask.get(id) ?? [],
    };
  });

  return { tasks: overlaid, cpm, floatFlags, loadClashes };
}
