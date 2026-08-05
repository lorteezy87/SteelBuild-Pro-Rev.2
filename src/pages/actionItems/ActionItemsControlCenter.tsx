import { useMemo } from "react";
import { ListChecks, Clock, AlertTriangle, CheckCircle, User, CalendarClock } from "lucide-react";
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
import type { Column, KpiCellDef } from "@/components/command";
import {
  buildActionItemsSummary,
  isOverdue,
  type ActionItemRecord,
} from "./actionItemsControlCenter.derive";
import { daysUntil } from "@/lib/dateMath";

// ─── Local helpers ─────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["All", "Open", "In Progress", "Complete", "Cancelled"];
const PRIORITY_FILTERS = ["All", "Critical", "High", "Medium", "Low"];

function dueCell(item: ActionItemRecord) {
  if (!item.due_date)
    return <span className="cmd-row__meta">No due date</span>;
  if (isOverdue(item))
    return (
      <span className="cmd-overdue">{item.due_date} · overdue</span>
    );
  const d = daysUntil(item.due_date);
  if (d === 0)
    return <span style={{ color: "var(--status-warning)", fontWeight: 700 }}>Today</span>;
  return <span>{item.due_date}</span>;
}

function ownerCell(item: ActionItemRecord) {
  if (!item.assigned_to)
    return <span className="cmd-row__meta" style={{ color: "var(--status-warning)" }}>Unassigned</span>;
  return <span>{item.assigned_to}</span>;
}

function linkedCell(item: ActionItemRecord) {
  const parts: string[] = [];
  if (item.meeting_reference) parts.push(item.meeting_reference);
  if (item.constraint_type) parts.push(item.constraint_type);
  if (!parts.length) return <span className="cmd-row__meta">—</span>;
  return <span className="cmd-row__meta">{parts.join(" · ")}</span>;
}

function scrollToTable() {
  document
    .querySelector(".action-items-cc .cmd-table-wrap")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ActionItemsControlCenterProps {
  projectName: string;
  /** All project action items (SETUP + regular). */
  actionItems: ActionItemRecord[];
  /** Caller-filtered rows that drive the DataTable. */
  filtered: ActionItemRecord[];
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (v: string) => void;
  onOpenItem: (item: ActionItemRecord) => void;
  onExport: () => void;
  onCreate?: (() => void) | null;
  /** Project-level context for the hero stat cards. */
  projectHealth?: string | null;
  percentComplete?: number | null;
  photoSrc?: string;
  /** Bulk selection. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ActionItemsControlCenter(
  props: ActionItemsControlCenterProps
) {
  const {
    projectName,
    actionItems,
    filtered,
    search,
    onSearch,
    statusFilter,
    onStatusFilterChange,
    priorityFilter,
    onPriorityFilterChange,
    onOpenItem,
    onExport,
    onCreate,
    projectHealth,
    percentComplete,
    photoSrc,
    selectedIds,
    onToggleSelect,
    onToggleAll,
  } = props;

  useCommandSkin();

  // Derive KPIs from ALL rows (not the filtered subset), same as the RFI pattern.
  const s = useMemo(() => buildActionItemsSummary(actionItems), [actionItems]);

  // ── Hero ───────────────────────────────────────────────────────────────────
  const heroStats = [
    { value: projectHealth || "—", label: "Project Health" },
    {
      value:
        percentComplete != null ? `${Math.round(percentComplete)}%` : "—",
      label: "WP Complete",
    },
  ];
  const chips = [
    { label: `${s.total} Total` },
    { label: `${s.active} Active`, tone: "good" as const },
    { label: `${s.overdue} Overdue` },
  ];

  // ── KPI strip ──────────────────────────────────────────────────────────────
  const kpiCells: KpiCellDef[] = [
    {
      label: "Open",
      value: s.open,
      sublabel: "items",
      tone: s.open ? "warn" : "neutral",
      Icon: ListChecks,
    },
    {
      label: "Overdue",
      value: s.overdue,
      sublabel: "items",
      tone: s.overdue ? "danger" : "neutral",
      Icon: Clock,
    },
    {
      label: "Due Today",
      value: s.dueToday,
      sublabel: "items",
      tone: s.dueToday ? "warn" : "neutral",
      Icon: CalendarClock,
    },
    {
      label: "Critical",
      value: s.critical,
      sublabel: "items",
      tone: s.critical ? "danger" : "neutral",
      Icon: AlertTriangle,
    },
    {
      label: "Completed",
      value: s.completed,
      sublabel: "items",
      tone: "good",
      Icon: CheckCircle,
    },
    {
      label: "% Complete",
      value: `${s.completionPct}%`,
      sublabel: "of all items",
      tone: s.completionPct === 100 ? "good" : "neutral",
      Icon: CheckCircle,
    },
  ];

  // ── Selectable column wiring ───────────────────────────────────────────────
  const selectable = !!(selectedIds && onToggleSelect && onToggleAll);
  const allSelected =
    selectable &&
    filtered.length > 0 &&
    selectedIds!.size === filtered.length;

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns: Column<ActionItemRecord>[] = [
    ...(selectable
      ? ([
          {
            key: "sel",
            header: (
              <input
                type="checkbox"
                className="cmd-check"
                checked={allSelected}
                onChange={(e) => onToggleAll!(e.target.checked)}
                aria-label="Select all action items"
              />
            ),
            render: (r: ActionItemRecord) => (
              <input
                type="checkbox"
                className="cmd-check"
                checked={selectedIds!.has(r.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onToggleSelect!(r.id, e.target.checked)}
                aria-label="Select action item"
              />
            ),
          },
        ] as Column<ActionItemRecord>[])
      : []),
    {
      key: "title",
      header: "Title",
      render: (r) => (
        <span style={{ fontWeight: 600 }}>{r.title || "Untitled"}</span>
      ),
    },
    {
      key: "type",
      header: "Type / Category",
      render: (r) => (
        <span className="cmd-row__meta">{r.category || r.constraint_type || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Pill tone={statusTone(r.status)}>{r.status}</Pill>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Pill tone={priorityTone(r.priority)}>{r.priority}</Pill>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      render: ownerCell,
    },
    {
      key: "due",
      header: "Due Date",
      render: dueCell,
    },
    {
      key: "linked",
      header: "Linked To",
      render: linkedCell,
    },
  ];

  return (
    <div className="action-items-cc">
      <PageHero
        Icon={ListChecks}
        title="Action Items Control Center"
        subtitle="Track open tasks, follow-ups, and field issues. Surface what needs to happen today."
        projectName={projectName}
        chips={chips}
        stats={heroStats}
        photoSrc={photoSrc}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1 — Today's Priorities */}
        <DecisionPanel
          title="Today's Priorities"
          onViewAll={() => {
            onStatusFilterChange("all");
            scrollToTable();
          }}
        >
          {s.todayQueue.map((item) => {
            const d = item.due_date ? daysUntil(item.due_date) : null;
            const dueTip =
              d === null
                ? "No date"
                : d < 0
                ? `${Math.abs(d)}d overdue`
                : d === 0
                ? "Due today"
                : `${d}d`;
            return (
              <div
                className="cmd-row is-clickable"
                key={item.id}
                onClick={() => onOpenItem(item)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="cmd-row__meta"
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.title || "Untitled"}
                  </div>
                  <div className="cmd-row__meta">{item.assigned_to || "Unassigned"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <Pill tone={priorityTone(item.priority)}>{item.priority}</Pill>
                  <span className="cmd-row__meta">{dueTip}</span>
                </div>
              </div>
            );
          })}
          {s.todayQueue.length === 0 && (
            <div className="cmd-row__meta">No active items.</div>
          )}
        </DecisionPanel>

        {/* Panel 2 — Waiting / Blocked */}
        <DecisionPanel
          title="Waiting On / Blocked"
          onViewAll={scrollToTable}
        >
          {s.waitingQueue.map((item) => (
            <div
              className="cmd-row is-clickable"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="cmd-row__meta"
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.title || "Untitled"}
                </div>
                <div className="cmd-row__meta" style={{ color: "var(--status-warning)" }}>
                  {item.assigned_to ? item.assigned_to : "No owner assigned"}
                </div>
              </div>
              <Pill tone={isOverdue(item) ? "danger" : "warn"}>
                {isOverdue(item) ? "Overdue" : "Unowned"}
              </Pill>
            </div>
          ))}
          {s.waitingQueue.length === 0 && (
            <div className="cmd-row__meta">Nothing blocked.</div>
          )}
        </DecisionPanel>

        {/* Panel 3 — By Owner */}
        <DecisionPanel title="By Owner" onViewAll={scrollToTable}>
          {s.byOwner.map((row) => (
            <div className="cmd-row" key={row.owner}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <User
                  size={12}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />
                <span className="cmd-row__num">{row.owner}</span>
              </div>
              <div className="cmd-row__meta">
                {row.count} active
                {row.overdueCount > 0 && (
                  <span style={{ color: "var(--status-error)", marginLeft: 6 }}>
                    · {row.overdueCount} overdue
                  </span>
                )}
                {row.criticalCount > 0 && (
                  <span style={{ color: "var(--status-error)", marginLeft: 6 }}>
                    · {row.criticalCount} critical
                  </span>
                )}
              </div>
            </div>
          ))}
          {s.byOwner.length === 0 && (
            <div className="cmd-row__meta">No active items.</div>
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search title, description, or owner"
        onExport={onExport}
        primaryLabel="New Action Item"
        onPrimary={onCreate || null}
        filters={
          <>
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                className={`cmd-chip-btn${statusFilter === st ? " is-active" : ""}`}
                onClick={() => onStatusFilterChange(st)}
              >
                {st}
              </button>
            ))}
            <span style={{ width: 1, background: "var(--border-default)", margin: "0 4px", alignSelf: "stretch" }} />
            {PRIORITY_FILTERS.map((p) => (
              <button
                key={p}
                type="button"
                className={`cmd-chip-btn${priorityFilter === p ? " is-active" : ""}`}
                onClick={() => onPriorityFilterChange(p)}
              >
                {p}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={onOpenItem}
        emptyMessage="No action items match your filters."
      />
    </div>
  );
}
