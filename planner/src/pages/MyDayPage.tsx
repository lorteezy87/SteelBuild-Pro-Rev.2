import { Link } from "react-router-dom";
import type { PlannerMyDayRow, PlannerScheduleTask, PlannerAction } from "@planner/data/plannerTypes";
import { deriveMyDayRows, type PlannerIdentityTokens } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function getMyDayRows(
  input: { actions: readonly PlannerAction[]; scheduleTasks: readonly PlannerScheduleTask[] },
  currentUser: PlannerIdentityTokens,
  todayIso: string,
): PlannerMyDayRow[] {
  return deriveMyDayRows(input, currentUser, todayIso);
}

function rowLabel(row: PlannerMyDayRow): string {
  return row.kind === "action"
    ? row.action.title?.trim() || "Untitled action"
    : row.scheduleTask.task_name?.trim() || "Untitled schedule task";
}

function rowDate(row: PlannerMyDayRow): string | null | undefined {
  return row.kind === "action"
    ? row.action.due_date ?? row.action.action_date ?? row.action.follow_up_date
    : row.scheduleTask.end_date ?? row.scheduleTask.start_date;
}

/** Signed-in user's current operational work, derived without changing source records. */
export default function MyDayPage() {
  const queue = usePlannerQueueData();
  const todayIso = queue.todayIso;
  const rows = getMyDayRows(queue, queue.currentUserIdentityTokens, todayIso);

  return (
    <section className="planner-workspace" aria-labelledby="planner-my-day-heading">
      <h2 id="planner-my-day-heading">My Day</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={rows.length === 0} emptyMessage="No active actions or schedule activities are assigned to you for today.">
        <p><time dateTime={todayIso}>{todayIso}</time> · {rows.length} assigned item{rows.length === 1 ? "" : "s"}</p>
        <ul aria-label="My Day work list">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.kind === "action" ? row.action.id : row.scheduleTask.id}`}>
              <strong>{rowLabel(row)}</strong>
              {rowDate(row) && <> — <time dateTime={rowDate(row) ?? undefined}>{rowDate(row)}</time></>}
              {row.kind === "action" && <> · <Link to="/task-register">Open in Task Register</Link></>}
            </li>
          ))}
        </ul>
      </PlannerQueueBoundary>
    </section>
  );
}
