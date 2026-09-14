/**
 * useScheduleBaselines — the project's baselines, and the snapshot map for the
 * one currently being drawn.
 *
 * Audit §1.5 / §7.2. Fetched here rather than inside ScheduleGantt for the same
 * reason `effectiveDatesMap` is: the Gantt renders phase-FILTERED rows, and
 * anything derived from that subset silently describes one phase while claiming
 * to describe the job (§1.1). Baselines are project-scoped, so they are fetched
 * project-scoped.
 *
 * The active baseline defaults to the most recent, which is what a PM means by
 * "the baseline" day to day. `is_original` (Baseline 0 — contract) is kept
 * distinguishable so a variance report can pick the contract schedule instead
 * when that is the comparison being made.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBaselines, fetchBaselineMap } from "@/services/scheduleBaselines";
import type { ScheduleBaseline, BaselineRow } from "@/services/scheduleBaselines";

export interface UseScheduleBaselinesResult {
  baselines: ScheduleBaseline[];
  activeBaseline: ScheduleBaseline | null;
  activeBaselineId: string | null;
  setActiveBaselineId: (id: string | null) => void;
  /** task_id → snapshot row, for the active baseline. Empty until loaded. */
  baselineMap: Record<string, BaselineRow>;
  isLoading: boolean;
  /** Re-read after taking or retracting a baseline. */
  refetch: () => void;
}

export function useScheduleBaselines(
  projectId: string | null | undefined,
): UseScheduleBaselinesResult {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["schedule-baselines", projectId],
    // Annotated: the ternary's `[]` branch widens the inferred return to
    // `any[] | Promise<ScheduleBaseline[]>`, which trips the noImplicitAny gate.
    queryFn: async (): Promise<ScheduleBaseline[]> =>
      projectId ? listBaselines(projectId) : [],
    enabled: !!projectId,
  });

  const baselines = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  // Newest first from the query's `-set_at` sort. A selection that no longer
  // exists (the baseline was retracted in another tab) falls back rather than
  // leaving the Gantt showing a map for a baseline that is gone.
  const activeBaseline = useMemo(() => {
    if (selectedId) {
      const found = baselines.find((b) => b.id === selectedId);
      if (found) return found;
    }
    return baselines[0] ?? null;
  }, [baselines, selectedId]);

  const mapQuery = useQuery({
    queryKey: ["schedule-baseline-tasks", activeBaseline?.id ?? null],
    queryFn: () => fetchBaselineMap(activeBaseline?.id),
    enabled: !!activeBaseline?.id,
  });

  return {
    baselines,
    activeBaseline,
    activeBaselineId: activeBaseline?.id ?? null,
    setActiveBaselineId: setSelectedId,
    // `?? {}` would be a fresh object identity every render and bust every memo
    // keyed on it, so fall back to a stable empty map.
    baselineMap: mapQuery.data ?? EMPTY_MAP,
    isLoading: listQuery.isLoading || mapQuery.isLoading,
    refetch: () => {
      void listQuery.refetch();
      void mapQuery.refetch();
    },
  };
}

const EMPTY_MAP: Record<string, BaselineRow> = Object.freeze({});
