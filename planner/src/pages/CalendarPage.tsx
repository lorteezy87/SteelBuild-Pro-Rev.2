import type { PlannerCalendarEvent } from "@planner/data/plannerTypes";
import { buildPlannerCalendarEvents } from "@planner/domain/plannerCalendar";
import { PlannerQueueBoundary, usePlannerQueueData } from "@planner/pages/usePlannerQueueData";

export function getCalendarEvents(input: Parameters<typeof buildPlannerCalendarEvents>[0]): PlannerCalendarEvent[] {
  return buildPlannerCalendarEvents(input);
}

/** Read-only merged action/schedule calendar. The semantic table remains usable without visual calendar scripting. */
export default function CalendarPage() {
  const queue = usePlannerQueueData();
  const events = getCalendarEvents({ actions: queue.actions, scheduleTasks: queue.scheduleTasks });

  return (
    <section className="planner-workspace" aria-labelledby="planner-calendar-heading">
      <h2 id="planner-calendar-heading">Calendar</h2>
      <PlannerQueueBoundary queue={queue} isEmpty={events.length === 0} emptyMessage="No active Planner action or schedule events are available in your authorized projects.">
        <table aria-label="Planner calendar event grid">
          <caption>{events.length} scheduled Planner event{events.length === 1 ? "" : "s"}</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Event</th><th scope="col">End</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <th scope="row"><time dateTime={event.start}>{event.start}</time></th>
                <td>{event.kind === "action" ? "Action" : event.isMilestone ? "Milestone" : "Schedule"}</td>
                <td>{event.title}</td>
                <td><time dateTime={event.end}>{event.end}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </PlannerQueueBoundary>
    </section>
  );
}
