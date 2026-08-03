import { Link } from "react-router-dom";
import type { PlannerAction, PlannerScheduleTask } from "@planner/data/plannerTypes";
import { derivePlannerCommandBuckets } from "@planner/domain/plannerQueueBuckets";
import { isPlannerTerminalStatus } from "@planner/domain/plannerActions";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

type CommandMetric = {
  label: string;
  count: number;
  to: string;
};

export function getCommandCenterMetrics(
  actions: readonly PlannerAction[],
  scheduleTasks: readonly PlannerScheduleTask[],
  projectCount: number,
  todayIso: string,
): CommandMetric[] {
  const buckets = derivePlannerCommandBuckets(actions, todayIso);
  const milestones = scheduleTasks.filter((task) => (
    !isPlannerTerminalStatus(task.status) && (task.is_milestone === true || task.milestone === true)
  )).length;
  const workstreams = new Set(actions.map((action) => action.workstream?.trim()).filter(Boolean)).size;

  return [
    { label: "Overdue", count: buckets.overdue.length, to: "/task-register?metric=overdue" },
    { label: "Due today", count: buckets.dueToday.length, to: "/task-register?metric=due-today" },
    { label: "Next 48 hours", count: buckets.next48.length, to: "/task-register?metric=next-48" },
    { label: "Waiting on", count: buckets.waitingOn.length, to: "/task-register?metric=waiting-on" },
    { label: "Milestones", count: milestones, to: "/milestones" },
    { label: "Workstreams", count: workstreams, to: "/task-register?metric=all" },
    { label: "Projects", count: projectCount, to: "/task-register?metric=all" },
  ];
}

/** Operational dashboard built entirely from authorized Planner action and schedule records. */
export default function CommandCenterPage() {
  const queue = usePlannerQueueData();
  const metrics = getCommandCenterMetrics(queue.actions, queue.scheduleTasks, queue.projectCount, queue.todayIso);
  const hasRows = queue.actions.length > 0 || queue.scheduleTasks.length > 0;

  return (
    <section className="planner-workspace" aria-labelledby="planner-command-center-heading">
      <h2 id="planner-command-center-heading">Command Center</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={!hasRows} emptyMessage="No active Planner actions or schedule activities are available in your authorized projects.">
        <p>Operational position as of <time dateTime={queue.todayIso}>{queue.todayIso}</time>.</p>
        <dl aria-label="Planner command metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd><Link to={metric.to}>{metric.count}</Link></dd>
            </div>
          ))}
        </dl>
      </PlannerQueueBoundary>
    </section>
  );
}
