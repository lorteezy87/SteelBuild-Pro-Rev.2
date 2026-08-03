import { useMemo, useState } from "react";
import ActionRegister from "@planner/components/register/ActionRegister";
import type { PlannerAction, PlannerActionFilters } from "@planner/data/plannerTypes";
import { deriveGateRows, filterPlannerActions } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function get48HourGateRows(actions: readonly PlannerAction[], todayIso: string): PlannerAction[] {
  return deriveGateRows(actions, 2, todayIso);
}

/** Near-term control gate for decisions that must not miss the next two working days. */
export default function Gate48HourPage() {
  const queue = usePlannerQueueData();
  const todayIso = queue.todayIso;
  const [filters, setFilters] = useState<PlannerActionFilters>({ search: "" });
  const rows = useMemo(() => filterPlannerActions(get48HourGateRows(queue.actions, todayIso), filters), [filters, queue.actions, todayIso]);

  return (
    <section className="planner-workspace" aria-labelledby="planner-48-hour-heading">
      <h2 id="planner-48-hour-heading">48-Hour Gate</h2>
      <p>Gate focus: approvals, VIFs, releases, loads, site readiness, ownership and decisions needed within 48 hours.</p>
      <PlannerQueueBoundary queue={queue} isEmpty={rows.length === 0} emptyMessage="No active Planner actions are overdue or require attention within the next 48 hours.">
        <p>{rows.length} action{rows.length === 1 ? "" : "s"} in the control window beginning <time dateTime={todayIso}>{todayIso}</time>.</p>
        <ActionRegister actions={rows} filters={filters} selectedActionIds={[]} onSelectedActionIdsChange={() => undefined} onFiltersChange={setFilters} onNewAction={() => undefined} onExport={() => undefined} onCompleteSelected={() => undefined} newActionDisabled newActionDisabledReason="Create actions in Task Register." completeSelectedDisabled completeSelectedDisabledReason="Complete actions in Task Register." exportDisabled exportDisabledReason="Export this filtered gate from Task Register." />
      </PlannerQueueBoundary>
    </section>
  );
}
