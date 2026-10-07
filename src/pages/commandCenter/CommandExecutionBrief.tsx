import { buildCommandBrief } from "./commandCenterBrief";
import type { ActionItem } from "./commandCenterControlCenter.derive";
import type { CommandHorizon } from "./commandCenterHorizons";

export default function CommandExecutionBrief({ actionItems, horizons, dataUpdatedAt, isRefreshing }: {
  actionItems: ActionItem[];
  horizons: CommandHorizon[];
  dataUpdatedAt?: number;
  isRefreshing?: boolean;
}) {
  const brief = buildCommandBrief(actionItems, horizons);
  const overdue = actionItems.filter(item => item.urgency === "overdue").length;
  // These source conditions can overlap an overdue urgency. Count them
  // independently so an overdue held task does not lose its recorded hold.
  const heldOrDelayed = actionItems.filter(item => item.status === "On Hold" || item.status === "Delayed").length;
  const impactedRfis = actionItems.filter(item => item.itemType === "RFI" && (item.raw.cost_impact || item.raw.schedule_impact)).length;
  return (
    <section className="sbp-execution-brief" aria-labelledby="sbp-execution-brief-title">
      <header>
        <div>
          <div className="sbp-command-register-head__eyebrow">Calculated from project records</div>
          <h2 id="sbp-execution-brief-title">Execution brief</h2>
        </div>
        <span className="cmd-row__meta">
          {dataUpdatedAt ? `Sources loaded ${new Date(dataUpdatedAt).toLocaleString()}` : "Project record snapshot"}
          {isRefreshing ? " · Refreshing sources…" : ""}
        </span>
      </header>
      <p className="sbp-execution-brief__exceptions">
        {overdue} overdue · {heldOrDelayed} held or delayed · {impactedRfis} RFI{impactedRfis === 1 ? "" : "s"} with impact
      </p>
      {!brief.priorities.length && <p>No dated actions or recorded blockers in these windows. This does not establish project readiness.</p>}
      <p className="sbp-execution-brief__gaps">
        Record gaps in open RFIs, submittals and schedule tasks: {brief.missingOwner} without an owner · {brief.missingDate} without a valid required date.
        {brief.missingDate > 0 ? " Undated work may fall outside the windows." : ""}
      </p>
      <details className="sbp-execution-brief__definitions">
        <summary>How the review windows work</summary>
        <p>Local calendar days: NOW includes overdue, today and recorded blockers; 48 HOURS covers days 1–2; 10 DAYS covers days 3–10.</p>
      </details>
    </section>
  );
}
