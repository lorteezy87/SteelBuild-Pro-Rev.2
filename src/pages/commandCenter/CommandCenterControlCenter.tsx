import { useEffect, useMemo, useRef, useState } from "react";
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
import type { CommandHorizonKey } from "./commandCenterHorizons";
import CommandExecutionBrief from "./CommandExecutionBrief";

export interface CommandCenterControlCenterProps {
  sources: CommandCenterSources;
  projectName?: string;
  projectCount?: number;
  dataUpdatedAt?: number;
  isRefreshing?: boolean;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeChange: (v: string) => void;
  onOpenItem: (item: ActionItem) => void;
  onForwardLook: () => void;
}

const TYPE_CHIPS = ["All", "RFI", "SUB", "CO", "DEL", "WP", "TASK"];
const URGENCY_LABELS: Record<ActionItem["urgency"], string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  blocking: "Blocked",
  awaiting: "Awaiting decision",
  normal: "—",
};

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

function recordedOwner(item: ActionItem): string {
  // Match the brief's evidence rule: the RFI mapper's default "Contractor"
  // is a routing fallback, not a recorded assignment.
  const owner = item.itemType === "RFI" ? item.raw.ball_in_court : item.owner;
  return typeof owner === "string" && owner.trim() ? owner.trim() : "Not recorded";
}

function columnHeading(label: string) {
  return <span className="sbp-command-column-heading">{label}</span>;
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
  const [horizonFilter, setHorizonFilter] = useState<CommandHorizonKey | null>(null);
  const registerHeading = useRef<HTMLHeadingElement>(null);
  const projectScope = sources.projects.map((project) => project.id).join(":");
  useEffect(() => setHorizonFilter(null), [projectScope]);
  const activeHorizon = horizons.find((horizon) => horizon.key === horizonFilter);

  const showHorizon = (key: CommandHorizonKey) => {
    onSearch("");
    onTypeChange("All");
    setHorizonFilter(key);
    registerHeading.current?.focus({ preventScroll: true });
    registerHeading.current?.scrollIntoView?.({ block: "start" });
  };

  const filteredItems = useMemo(() => {
    let items = activeHorizon?.items ?? summary.actionItems;
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
  }, [summary.actionItems, activeHorizon, typeFilter, search]);

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
      header: columnHeading("Type"),
      grid: "72px",
      render: (row) => <span className="cmd-row__num">{row.itemType}</span>,
    },
    {
      key: "title",
      header: columnHeading("Issue / Action"),
      grid: "minmax(220px, 2fr)",
      render: (row) => <span style={{ fontWeight: 650 }}>{row.title}</span>,
    },
    {
      key: "status",
      header: columnHeading("Status"),
      grid: "126px",
      render: (row) => row.status ? <Pill tone={row.status === "Open" ? "neutral" : statusTone(row.status)}>{row.status}</Pill> : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "priority",
      header: columnHeading("Priority"),
      grid: "92px",
      render: (row) => row.priority ? <Pill tone={priorityTone(row.priority)}>{row.priority}</Pill> : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "urgency",
      header: columnHeading("Risk"),
      grid: "154px",
      render: (row) => row.urgency === "normal"
        ? <span className="cmd-row__meta">—</span>
        : <Pill tone={urgencyTone(row.urgency)}>{URGENCY_LABELS[row.urgency]}</Pill>,
    },
    {
      key: "owner",
      header: columnHeading("Owner / BIC"),
      grid: "minmax(140px, 1fr)",
      render: (row) => <span>{recordedOwner(row)}</span>,
    },
    {
      key: "due",
      header: columnHeading("Required By"),
      grid: "126px",
      render: (row) => row.dueDate
        ? <span className={row.urgency === "overdue" ? "cmd-overdue" : ""}>{row.dueDate}</span>
        : <span className="cmd-row__meta">—</span>,
    },
    {
      key: "linkedTo",
      header: columnHeading("Linked To"),
      grid: "minmax(100px, 1fr)",
      render: (row) => <span className="cmd-row__meta">{row.linkedTo || "—"}</span>,
    },
  ];

  return (
    <div className="cc-cmd sbp-command-page sbp-command-surface">
      <PageHeader
        eyebrow={projectName ? `${projectName} / Command` : "Portfolio / Command"}
        title="Command Center"
        meta={`${projectTotal} project${projectTotal === 1 ? "" : "s"} in scope · ${summary.actionItems.length} actionable item${summary.actionItems.length === 1 ? "" : "s"}`}
      />

      <OperationalSummary metrics={metrics} ariaLabel="Command Center operational summary" />

      <CommandExecutionBrief
        actionItems={summary.actionItems} horizons={horizons}
        dataUpdatedAt={props.dataUpdatedAt} isRefreshing={props.isRefreshing}
      />

      <nav className="sbp-horizon-filters" aria-label="Project control horizons">
        <button type="button" aria-label="Show all horizons" aria-pressed={!activeHorizon}
          onClick={() => setHorizonFilter(null)}>
          All work <span>{summary.actionItems.length}</span>
        </button>
        {horizons.map((horizon) => (
          <button type="button" key={horizon.key}
            aria-label={`View all ${horizon.items.length} item${horizon.items.length === 1 ? "" : "s"} in ${horizon.label}`}
            aria-pressed={horizonFilter === horizon.key}
            onClick={() => showHorizon(horizon.key)}>
            {horizon.label} <span>{horizon.items.length}</span>
          </button>
        ))}
      </nav>

      <div className="sbp-command-register-head">
        <div>
          <h2 ref={registerHeading} tabIndex={-1}>{activeHorizon ? `${activeHorizon.label} Action Items` : "All Action Items"}</h2>
        </div>
        <div className="sbp-command-register-head__count">{filteredItems.length} shown</div>
      </div>

      {activeHorizon ? (
        <p className="sbp-command-filter-status" role="status">Showing the full {activeHorizon.label} horizon</p>
      ) : null}

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
                aria-pressed={typeFilter === type}
                onClick={() => onTypeChange(type)}
              >
                {type}
              </button>
            ))}
          </>
        }
      />

      <div className="sbp-command-register" role="region" aria-label="Action register" tabIndex={0}>
        <div className="sbp-command-register__content">
          <DataTable
            columns={columns}
            rows={filteredItems}
            onRowClick={onOpenItem}
            emptyMessage="No open action items match your filters."
          />
        </div>
      </div>
    </div>
  );
}
