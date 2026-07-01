/**
 * CommandCenterControlCenter — light Command UI redesign of the Command Center.
 *
 * Kit archetype: PageHero + KpiStrip (6 cells) + 3 DecisionPanels + FilterBar + DataTable.
 * Rendered only when the `command_ui` flag is on — the classic CommandCenter.jsx
 * path is untouched.
 *
 * Data wiring lives in CommandCenter.jsx (the existing queries); this component is
 * pure-presentational, receiving pre-built `summary` + raw arrays + handlers.
 */
import { useMemo } from "react";
import {
  LayoutDashboard,
  AlertTriangle,
  Clock,
  CheckSquare,
  Truck,
  DollarSign,
  CalendarCheck,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  statusTone,
  priorityTone,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef, PillTone } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { buildCommandCenterSummary } from "./commandCenterControlCenter.derive";
import type {
  CommandCenterSources,
  ActionItem,
  PanelRow,
  PanelTone,
} from "./commandCenterControlCenter.derive";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CommandCenterControlCenterProps {
  /** All raw entity arrays — identical to what CommandCenter.jsx already queries. */
  sources: CommandCenterSources;
  /** For the hero section. */
  projectName?: string;
  projectCount?: number;
  /** Global search value + handler (wires into FilterBar). */
  search: string;
  onSearch: (v: string) => void;
  /** Type-filter chips ("All" | "RFI" | "SUB" | "CO" | "DEL"). */
  typeFilter: string;
  onTypeChange: (v: string) => void;
  /** Open the classic item detail drawer. */
  onOpenItem: (item: ActionItem) => void;
  /** "Forward Look" button handler — reuses existing ForwardLookDrawer. */
  onForwardLook: () => void;
}

// ── Type filter chip labels ───────────────────────────────────────────────

const TYPE_CHIPS = ["All", "RFI", "SUB", "CO", "DEL", "WP"];

// ── Helpers ───────────────────────────────────────────────────────────────

function urgencyTone(u: ActionItem["urgency"]): PanelTone {
  switch (u) {
    case "overdue": return "danger";
    case "blocking": return "danger";
    case "due-soon": return "warn";
    case "awaiting": return "neutral";
    default: return "neutral";
  }
}

function panelToneToPillTone(t: PanelTone): PillTone {
  switch (t) {
    case "danger": return "danger";
    case "warn": return "warn";
    case "good": return "good";
    default: return "neutral";
  }
}

function itemTypeLabel(t: string): string {
  return t; // Already short (RFI, SUB, CO, DEL, WP, TASK)
}

/** Scroll the action-items table into view when a panel's "View all" fires. */
function scrollToTable() {
  document.querySelector(".cc-cmd .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Panel row ─────────────────────────────────────────────────────────────

function PanelItem({ row }: { row: PanelRow }) {
  return (
    <div className="cmd-row">
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            className="cmd-row__num"
            style={{ fontSize: 10, letterSpacing: "0.08em" }}
          >
            {row.itemType}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{row.label}</span>
        </div>
        <div className="cmd-row__meta">{row.sub}</div>
      </div>
      <Pill tone={panelToneToPillTone(row.tone)}>
        {row.tone === "danger" ? "Urgent" : row.tone === "warn" ? "At Risk" : "Pending"}
      </Pill>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

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

  // ── Filter action items ─────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = summary.actionItems;
    if (typeFilter !== "All") {
      items = items.filter((i) => i.itemType === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.status || "").toLowerCase().includes(q) ||
          (i.owner || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [summary.actionItems, typeFilter, search]);

  // ── Hero chips ──────────────────────────────────────────────────────────
  const chips = [
    { label: `${sources.projects.length || projectCount} Project${(sources.projects.length || projectCount) !== 1 ? "s" : ""}` },
    { label: `${summary.kpis.openActionItems} Open`, tone: summary.kpis.openActionItems > 0 ? "warn" as const : "good" as const },
    { label: `${summary.kpis.overdueRfis} Overdue RFIs` },
  ];

  // ── KPI strip ────────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Open Action Items",
      value: summary.kpis.openActionItems,
      sublabel: "RFIs + submittals + COs",
      tone: summary.tones.openActionItems,
      Icon: CheckSquare,
    },
    {
      label: "Approvals Pending",
      value: summary.kpis.approvalsPending,
      sublabel: "OFA / IFA submittals",
      tone: summary.tones.approvalsPending,
      Icon: Clock,
    },
    {
      label: "Overdue RFIs",
      value: summary.kpis.overdueRfis,
      sublabel: "past response date",
      tone: summary.tones.overdueRfis,
      Icon: AlertTriangle,
    },
    {
      label: "Field Issues",
      value: summary.kpis.fieldIssues,
      sublabel: "WPs on hold + delays",
      tone: summary.tones.fieldIssues,
      Icon: Truck,
    },
    {
      label: "COs Pending",
      value: summary.kpis.budgetVariance ?? 0,
      sublabel: "awaiting approval",
      tone: summary.tones.budgetVariance,
      Icon: DollarSign,
    },
    {
      label: "Schedule Health",
      value: summary.kpis.scheduleHealth,
      sublabel: "based on active tasks",
      tone: summary.tones.scheduleHealth,
      Icon: CalendarCheck,
    },
  ];

  // ── DataTable columns ────────────────────────────────────────────────────
  const columns: Column<ActionItem>[] = [
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="cmd-row__num" style={{ fontSize: 10 }}>
          {itemTypeLabel(r.itemType)}
        </span>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (r) => (
        <span style={{ fontWeight: 500 }}>{r.title}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        r.status ? <Pill tone={statusTone(r.status)}>{r.status}</Pill> : <span className="cmd-row__meta">—</span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        r.priority ? <Pill tone={priorityTone(r.priority)}>{r.priority}</Pill> : <span className="cmd-row__meta">—</span>
      ),
    },
    {
      key: "urgency",
      header: "Urgency",
      render: (r) => <Pill tone={urgencyTone(r.urgency)}>{r.urgency}</Pill>,
    },
    {
      key: "owner",
      header: "Owner / BIC",
      render: (r) => <span>{r.owner || "—"}</span>,
    },
    {
      key: "due",
      header: "Due Date",
      render: (r) => (
        r.dueDate
          ? <span className={r.urgency === "overdue" ? "cmd-overdue" : ""}>{r.dueDate}</span>
          : <span className="cmd-row__meta">—</span>
      ),
    },
    {
      key: "linkedTo",
      header: "Linked To",
      render: (r) => <span className="cmd-row__meta">{r.linkedTo || "—"}</span>,
    },
  ];

  return (
    <div className="cc-cmd">
      <PageHero
        Icon={LayoutDashboard}
        title="Command Center"
        subtitle="Daily command for aligned decisions, issue resolution, and proactive project control."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("CommandCenter") ?? undefined}
        stats={[]}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel
          title="Today's Priorities"
          onViewAll={() => { onTypeChange("All"); scrollToTable(); }}
        >
          {summary.panels.todayPriorities.length === 0 ? (
            <div className="cmd-row__meta">Nothing due today — all clear.</div>
          ) : (
            summary.panels.todayPriorities.map((row) => (
              <PanelItem key={row.id} row={row} />
            ))
          )}
        </DecisionPanel>

        <DecisionPanel
          title="Waiting On"
          onViewAll={scrollToTable}
        >
          {summary.panels.waitingOn.length === 0 ? (
            <div className="cmd-row__meta">Nothing pending external response.</div>
          ) : (
            summary.panels.waitingOn.map((row) => (
              <PanelItem key={row.id} row={row} />
            ))
          )}
        </DecisionPanel>

        <DecisionPanel
          title="Risk Watchlist"
          onViewAll={scrollToTable}
        >
          {summary.panels.riskWatchlist.length === 0 ? (
            <div className="cmd-row__meta">No flagged risks.</div>
          ) : (
            summary.panels.riskWatchlist.map((row) => (
              <PanelItem key={row.id} row={row} />
            ))
          )}
        </DecisionPanel>
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
            {TYPE_CHIPS.map((t) => (
              <button
                key={t}
                type="button"
                className={`cmd-chip-btn${typeFilter === t ? " is-active" : ""}`}
                onClick={() => onTypeChange(t)}
              >
                {t}
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
