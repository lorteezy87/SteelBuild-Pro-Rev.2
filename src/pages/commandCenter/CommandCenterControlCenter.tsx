import { useMemo } from "react";
import "@/styles/command.css";
import "@/styles/command-center-system.css";
import {
  DataTable,
  FilterBar,
  OperationalSummary,
  PageHeader,
  Pill,
  priorityTone,
  statusTone,
  useCommandSkin,
} from "@/components/command";
import type { Column, OperationalMetric } from "@/components/command";
import { buildCommandCenterSummary } from "./commandCenterControlCenter.derive";
import type {
  ActionItem,
  CommandCenterSources,
  PanelTone,
} from "./commandCenterControlCenter.derive";
import { deriveCommandHorizons } from "./commandCenterHorizons";
import type { CommandHorizon } from "./commandCenterHorizons";

export interface CommandCenterControlCenterProps {
  sources: CommandCenterSources;
  projectName?: string;
  projectCount?: number;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeChange: (v: string) => void;
  onOpenItem: (item: ActionItem) => void;
  onForwardLook: () => void;
}

const TYPE_CHIPS = ["All", "RFI", "SUB", "CO", "DEL", "WP"];

function urgencyTone(urgency: ActionItem["urgency"]): PanelTone {
  switch (urgency) {
    case "overdue":
    case "blocking":
      return "danger";
    case "due-soon":
      return "warn";
    default:
      return "neutral";
  }
}

function horizonTone(horizon: CommandHorizon): PanelTone {
  if (horizon.items.some((item) => item.urgency === "overdue" || item.urgency === "blocking")) return "danger";
  if (horizon.items.some((item) => item.urgency === "due-soon")) return "warn";
  return horizon.items.length > 0 ? "neutral" : "good";
}

function formatDue(item: ActionItem): string {
  if (!item.dueDate) return item.urgency === "blocking" ? "Blocking" : "No date";
  return item.dueDate;
}

function HorizonPanel({ horizon, onOpenItem }: { horizon: CommandHorizon; onOpenItem: (item: ActionItem) => void }) {
  const tone = horizonTone(horizon);
  return (
    <section className={`sbp-horizon is-${tone}`} aria-labelledby={`sbp-horizon-${horizon.key}`}>
      <header className="sbp-horizon__head">
        <div>
          <div className="sbp-horizon__eyebrow">Project Control Horizon</div>
          <h2 id={`sbp-horizon-${horizon.key}`}>{horizon.label}</h2>
        </div>
        <span className="sbp-horizon__count">{horizon.items.length}</span>
      </header>
      <div className="sbp-horizon__body">
        {horizon.items.length === 0 ? (
          <div className="sbp-horizon__empty">No dated action items in this window.</div>
        ) : (
          horizon.items.slice(0, 7).map((item) => (
            <button
              key={`${item.itemType}:${item.id}`}
              type="button"
              className="sbp-horizon__item"
              onClick={() => onOpenItem(item)}
            >
              <div className="sbp-horizon__item-main">
                <span className="sbp-horizon__type">{item.itemType}</span>
                <span className="sbp-horizon__title">{item.title}</span>
              </div>
              <div className="sbp-horizon__item-meta">
                <span>{formatDue(item)}</span>
                {item.owner ? <span>{item.owner}</span> : null}
                {item.status ? <span>{item.status}</span> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export default function CommandCenterControlCenter(props: CommandCenterControlCenterProps) {
  const {
    sources,
    projectName,
    projectCount = 0,
    search,
    onSearch,
    typeFilter,
    onTypeChange,
    onOpenItem,
    onForwardLook,
  } = props;

  useCommandSkin();

  const summary = useMemo(() => buildCommandCenterSummary(sources), [sources]);
  const horizons = useMemo(() => deriveCommandHorizons(summary.actionItems), [summary.actionItems]);

  const filteredItems = useMemo(() => {
    let items = summary.actionItems;
    if (typeFilter !== "All") items = items.filter((item) => item.itemType === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.status || "").toLowerCase().includes(q) ||
          (item.owner || "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [summary.actionItems, typeFilter, search]);

  const projectTotal = sources.projects.length || projectCount;
  const metrics: OperationalMetric[] = [
    {
      label: "Open Action Items",
      value: summary.kpis.openActionItems,
      sublabel: "RFIs + submittals + COs",
      tone: summary.tones.openActionItems,
    },
    {
      label: "Approvals Pending",
      value: summary.kpis.approvalsPending,
      sublabel: "external review",
      tone: summary.tones.approvalsPending,
    },
    {
      label: "Overdue RFIs",
      value: summary.kpis.overdueRfis,
      sublabel: "past response date",
      tone: summary.tones.overdueRfis,
    },
    {
      label: "Field Issues",
      value: summary.kpis.fieldIssues,
      sublabel: "holds + delayed loads",
      tone: summary.tones.fieldIssues,
    },
    {
      label: "COs Pending",
      value: summary.kpis.budgetVariance ?? 0,
      sublabel: "awaiting disposition",
      tone: summary.tones.budgetVariance,
    },
    {
      label: "Schedule Health",
      value: summary.kpis.scheduleHealth,
      sublabel: "active task evidence",
      tone: summary.tones.scheduleHealth,
    },
  ];

  const columns: Column<ActionItem>[] = [
    {
      key: "type",
      header: "Type",
      render: (row) => <span className="cmd-row__num" style={{ fontSize: 10 }}>{row.itemType}</span>,
    },
    {
      key: "title",
      header: "Issue / Action",
      render: (row) => <span style={{ fontWeight: 650 }}>{row.title}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => row.status ? <Pill tone={statusTone(row.status)}>{row.status}</Pill> : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (row) => row.priority ? <Pill tone={priorityTone(row.priority)}>{row.priority}</Pill> : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "urgency",
      header: "Risk",
      render: (row) => <Pill tone={urgencyTone(row.urgency)}>{row.urgency}</Pill>,
    },
    {
      key: "owner",
      header: "Owner / BIC",
      render: (row) => <span>{row.owner || "—"}</span>,
    },
    {
      key: "due",
      header: "Required By",
      render: (row) => row.dueDate
        ? <span className={row.urgency === "overdue" ? "cmd-overdue" : ""}>{row.dueDate}</span>
        : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "linkedTo",
      header: "Linked To",
      render: (row) => <span className="cmd-row__meta">{row.linkedTo || "—"}</span>,
    },
  ];

  return (
    <div className="cc-cmd sbp-command-page sbp-command-surface">
      <PageHeader
        eyebrow={projectName ? `${projectName} / Command` : "Portfolio / Command"}
        title="Command Center"
        subtitle="Work the project by urgency: what needs action now, what must be ready in 48 hours, and what is coming in the next 10 days."
        meta={`${projectTotal} project${projectTotal === 1 ? "" : "s"} in scope · ${summary.actionItems.length} actionable items`}
      />

      <OperationalSummary metrics={metrics} ariaLabel="Command Center operational summary" />

      <div className="sbp-horizons" aria-label="Project control horizons">
        {horizons.map((horizon) => (
          <HorizonPanel key={horizon.key} horizon={horizon} onOpenItem={onOpenItem} />
        ))}
      </div>

      <div className="sbp-command-register-head">
        <div>
          <div className="sbp-command-register-head__eyebrow">Complete Action Register</div>
          <h2>All Action Items</h2>
        </div>
        <div className="sbp-command-register-head__count">{filteredItems.length} shown</div>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search RFIs, submittals, change orders, deliveries…"
        onExport={undefined}
        onImport={null}
        primaryLabel="Forward Look →"
        onPrimary={onForwardLook}
        filters={
          <>
            {TYPE_CHIPS.map((type) => (
              <button
                key={type}
                type="button"
                className={`cmd-chip-btn${typeFilter === type ? " is-active" : ""}`}
                onClick={() => onTypeChange(type)}
              >
                {type}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filteredItems}
        onRowClick={onOpenItem}
        emptyMessage="No open action items match your filters."
      />
    </div>
  );
}
