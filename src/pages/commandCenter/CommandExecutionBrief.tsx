import { buildCommandBrief } from "./commandCenterBrief";
import type { ActionItem } from "./commandCenterControlCenter.derive";
import type { CommandHorizon } from "./commandCenterHorizons";

export default function CommandExecutionBrief({ actionItems, horizons, dataUpdatedAt, isRefreshing, onOpenItem }: {
  actionItems: ActionItem[];
  horizons: CommandHorizon[];
  dataUpdatedAt?: number;
  isRefreshing?: boolean;
  onOpenItem: (item: ActionItem) => void;
}) {
  const brief = buildCommandBrief(actionItems, horizons);
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
      <p className="sbp-execution-brief__windows">
        {horizons.map((horizon) => `${horizon.items.length} ${horizon.label}`).join(" · ")}
      </p>
      <p className="cmd-row__meta">Local calendar days: NOW includes overdue, today and recorded blockers; 48 HOURS covers days 1–2; 10 DAYS covers days 3–10.</p>
      {brief.priorities.length ? (
        <ol className="sbp-execution-brief__priorities">
          {brief.priorities.map(({ item, window, reason, owner }) => (
            <li key={`${item.itemType}:${item.id}`}>
              <button type="button" onClick={() => onOpenItem(item)}>
                <span className="sbp-horizon__type">{window} · {item.itemType}</span>
                <strong>{item.title}</strong>
                <span className="cmd-row__meta">{reason}{owner ? ` · ${owner}` : ""}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>No dated actions or recorded blockers in these windows. This does not establish project readiness.</p>}
      <p className="sbp-execution-brief__gaps">
        Record gaps in open RFIs, submittals and schedule tasks: {brief.missingOwner} without an owner · {brief.missingDate} without a valid required date.
        {brief.missingDate > 0 ? " Undated work may fall outside the windows." : ""}
      </p>
    </section>
  );
}
