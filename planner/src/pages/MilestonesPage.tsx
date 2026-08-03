import type { PlannerScheduleTask } from "@planner/data/plannerTypes";
import { isPlannerTerminalStatus } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function getMilestoneRows(scheduleTasks: readonly PlannerScheduleTask[]): PlannerScheduleTask[] {
  return scheduleTasks.filter((task) => !isPlannerTerminalStatus(task.status) && (task.is_milestone === true || task.milestone === true));
}

/** Schedule-only milestone view; action records never masquerade as milestones. */
export default function MilestonesPage() {
  const queue = usePlannerQueueData();
  const rows = getMilestoneRows(queue.scheduleTasks);

  return (
    <section className="planner-workspace" aria-labelledby="planner-milestones-heading">
      <h2 id="planner-milestones-heading">Milestones</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={rows.length === 0} emptyMessage="No active milestone schedule activities are available in your authorized projects.">
        <p>{rows.length} active milestone{rows.length === 1 ? "" : "s"}.</p>
        <ul aria-label="Milestone schedule activity list">
          {rows.map((task) => <li key={task.id}><strong>{task.task_name?.trim() || "Untitled schedule task"}</strong>{task.start_date && <> — <time dateTime={task.start_date}>{task.start_date}</time></>}</li>)}
        </ul>
      </PlannerQueueBoundary>
    </section>
  );
}
