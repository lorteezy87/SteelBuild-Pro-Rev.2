import { Link } from "react-router-dom";
import type { PlannerAction } from "@planner/data/plannerTypes";
import { deriveWaitingOnRows } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function getWaitingOnRows(actions: readonly PlannerAction[]): PlannerAction[] {
  return deriveWaitingOnRows(actions);
}

/** Dependencies with an accountable outside party, never a blank placeholder dependency. */
export default function WaitingOnPage() {
  const queue = usePlannerQueueData();
  const rows = getWaitingOnRows(queue.actions);

  return (
    <section className="planner-workspace" aria-labelledby="planner-waiting-on-heading">
      <h2 id="planner-waiting-on-heading">Waiting On</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={rows.length === 0} emptyMessage="No active Planner actions are waiting on a named party.">
        <p>{rows.length} action{rows.length === 1 ? "" : "s"} with an accountable dependency.</p>
        <ul aria-label="Waiting on action list">
          {rows.map((action) => (
            <li key={action.id}>
              <strong>{action.title?.trim() || "Untitled action"}</strong> — {action.waiting_on?.trim()}
              {action.due_date && <> · required <time dateTime={action.due_date}>{action.due_date}</time></>}
              <> · <Link to="/task-register">Open in Task Register</Link></>
            </li>
          ))}
        </ul>
      </PlannerQueueBoundary>
    </section>
  );
}
