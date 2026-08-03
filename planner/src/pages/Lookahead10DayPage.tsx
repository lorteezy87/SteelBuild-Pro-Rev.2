import { useMemo, useState } from "react";
import ActionRegister from "@planner/components/register/ActionRegister";
import type { PlannerAction, PlannerActionFilters } from "@planner/data/plannerTypes";
import { deriveGateRows, filterPlannerActions } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function get10DayLookaheadRows(actions: readonly PlannerAction[], todayIso: string): PlannerAction[] {
  return deriveGateRows(actions, 10, todayIso);
}

/** Ten-day action projection using the same deterministic gate definition as the 48-hour control. */
export default function Lookahead10DayPage() {
  const queue = usePlannerQueueData();
  const todayIso = queue.todayIso;
  const [filters, setFilters] = useState<PlannerActionFilters>({ search: "" });
  const rows = useMemo(() => filterPlannerActions(get10DayLookaheadRows(queue.actions, todayIso), filters), [filters, queue.actions, todayIso]);

  return (
    <section className="planner-workspace" aria-labelledby="planner-10-day-heading">
      <h2 id="planner-10-day-heading">10-Day Lookahead</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={rows.length === 0} emptyMessage="No active Planner actions are overdue or require attention within the next 10 days.">
        <p>{rows.length} action{rows.length === 1 ? "" : "s"} in the control window.</p>
        <ActionRegister actions={rows} filters={filters} selectedActionIds={[]} onSelectedActionIdsChange={() => undefined} onFiltersChange={setFilters} onNewAction={() => undefined} onExport={() => undefined} onCompleteSelected={() => undefined} newActionDisabled newActionDisabledReason="Create actions in Task Register." completeSelectedDisabled completeSelectedDisabledReason="Complete actions in Task Register." exportDisabled exportDisabledReason="Export this filtered gate from Task Register." />
      </PlannerQueueBoundary>
    </section>
  );
}
