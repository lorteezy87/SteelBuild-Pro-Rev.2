/**
 * FieldTodayControlCenter.tsx — Command UI skin for the Field Today page.
 *
 * Behavior-preserving wrapper: all mutations (progress, punch, photo) are
 * passed in as props and call the SAME outbox-backed handlers from FieldToday.jsx.
 * This component is purely presentational + routing; it owns no mutation state.
 *
 * Data sources (all real — no fabricated fields):
 *   tasks         → ScheduleTask[] (useScheduleTasks)
 *   photos        → Photo[] (passed in; today's already filtered by parent)
 *   punchItems    → PunchlistItem[] (passed in; open items)
 *   todayIso      → localToday()
 *   pendingSync   → useFieldOutbox pending count
 *   onSetProgress → calls progressMut.mutate (offline-safe)
 *   onAddPunch    → opens PunchlistFormModal → punchMut.mutate (offline-safe)
 *   onAddPhoto    → triggers photoInputRef.click → handlePhotoFiles (offline-safe)
 *   onDailyLog    → navigate("/DailyLogs?new=1")
 *   onFlushOutbox → flushOutbox()
 *
 * KPI substitutions (see report):
 *   "Weather"        → MISSING (no real source) → SUBSTITUTED: "Today's Tasks"
 *   "Workers on Site"→ MISSING (no crew-count table) → SUBSTITUTED: "Open Punch Items"
 *   "Safety Warnings"→ MISSING (no safety_alerts table tied to today) → SUBSTITUTED: "Overdue Tasks"
 *   "Inspections"    → MISSING in FieldToday scope (no inspections query) → SUBSTITUTED: "Completed Today"
 *   "Deliveries"     → MISSING (deliveries not queried here) → "Photos Today" from entities.Photo
 */

import { useMemo, useState } from "react";
import { useResolvedFileUrl } from "@/hooks/useResolvedFileUrl";
import {
  CalendarCheck,
  Camera,
  ClipboardCheck,
  ClipboardList,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  ImageIcon,
} from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef, KpiTone } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import {
  buildFieldTodaySummary,
  URGENCY_DISPLAY,
  FieldTaskRow,
  ScheduleTaskRecord,
  PhotoRecord,
  PunchlistItemRecord,
} from "./fieldTodayControlCenter.derive";
import { PROGRESS_STEPS, clampPercent } from "@/lib/field/fieldToday";

// ── Photo thumbnail ─────────────────────────────────────────────────────────────
// Stored photo file_url values are storage PATHS (not fetchable URLs), so an
// <img src={path}> renders as a broken thumbnail. Resolve each through
// resolveFileUrl (→ short-lived signed URL) via useResolvedFileUrl, and fall back
// to the placeholder icon on any resolve/load failure — a photo never shows a
// broken image, it shows the icon instead.
function PhotoThumb({ fileUrl, title }: { fileUrl: string | null; title: string | null }) {
  const { url } = useResolvedFileUrl(fileUrl);
  const [failed, setFailed] = useState(false);
  if (fileUrl && url && !failed) {
    return (
      <img
        src={url}
        alt={title ?? "Field photo"}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.3,
      }}
    >
      <ImageIcon size={16} />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FieldTodayControlCenterProps {
  projectName: string;
  todayIso: string;
  tasks: ScheduleTaskRecord[];
  /** Today's photos — caller filters by taken_date === todayIso */
  photos: PhotoRecord[];
  /** Open punch items — caller filters to project */
  punchItems: PunchlistItemRecord[];
  /** From useFieldOutbox */
  pendingSync: number;
  isLoading: boolean;
  search: string;
  onSearch: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  /** Sets task progress — calls the offline-safe progressMut */
  onSetProgress: (task: ScheduleTaskRecord, pct: number) => void;
  /** Opens the PunchlistFormModal */
  onAddPunch: () => void;
  /** Triggers the hidden file input for camera capture */
  onAddPhoto: () => void;
  /** Navigate to Daily Logs */
  onDailyLog: () => void;
  /** Manually drain the offline outbox */
  onFlushOutbox: () => void;
  /** Whether a progress save is in flight for a specific task id */
  savingTaskId?: string | null;
  uploadingPhoto?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map urgency bucket to command Pill tone. */
function urgencyTone(bucket: string): import("@/components/command").PillTone {
  switch (bucket) {
    case "overdue":    return "danger";
    case "due-today":  return "warn";
    case "active":     return "good";
    case "unscheduled": return "neutral";
    case "upcoming":   return "info";
    default:           return "neutral";
  }
}

/** Map task completion status to Pill tone. */
function statusTone(status: string): import("@/components/command").PillTone {
  switch (status) {
    case "Complete":    return "good";
    case "In Progress": return "info";
    default:            return "neutral";
  }
}

/** Scroll the DataTable into view when a panel "View all" is clicked. */
function scrollToTable() {
  document.querySelector(".field-today-cc .cmd-table-wrap")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// ── Status filter chips ───────────────────────────────────────────────────────

const STATUS_CHIPS = [
  { label: "All",          value: "all" },
  { label: "Overdue",      value: "overdue" },
  { label: "Due Today",    value: "due-today" },
  { label: "Active",       value: "active" },
  { label: "Unscheduled",  value: "unscheduled" },
];

// ── Inline progress buttons (thumb-friendly, inline style only) ───────────────

interface ProgressButtonsProps {
  task: ScheduleTaskRecord;
  saving: boolean;
  onSetProgress: (pct: number) => void;
}

function ProgressButtons({ task, saving, onSetProgress }: ProgressButtonsProps) {
  const pct = clampPercent(task.percent_complete);
  const bucket = task.__urgencyBucket as string | undefined;
  const accentColor = URGENCY_DISPLAY[(bucket as keyof typeof URGENCY_DISPLAY) ?? "active"]?.color ?? "var(--accent)";

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
      {PROGRESS_STEPS.map((step) => {
        const active = pct === step;
        return (
          <button
            key={step}
            type="button"
            disabled={saving}
            onClick={(e) => { e.stopPropagation(); onSetProgress(step); }}
            aria-pressed={active}
            style={{
              minHeight: 28,
              minWidth: 34,
              borderRadius: 6,
              border: `1px solid ${active ? accentColor : "var(--cmd-border)"}`,
              background: active
                ? `color-mix(in srgb, ${accentColor} 18%, var(--cmd-surface))`
                : "var(--cmd-surface)",
              color: active ? accentColor : "var(--cmd-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 800,
              cursor: saving ? "wait" : "pointer",
              padding: "0 6px",
              flexShrink: 0,
            }}
          >
            {step === 100 ? "Done" : `${step}`}
          </button>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FieldTodayControlCenter(props: FieldTodayControlCenterProps) {
  const {
    projectName, todayIso, tasks, photos, punchItems,
    pendingSync, isLoading, search, onSearch, statusFilter, onStatusFilter,
    onSetProgress, onAddPunch, onAddPhoto, onDailyLog, onFlushOutbox,
    savingTaskId, uploadingPhoto,
  } = props;

  useCommandSkin();

  const s = useMemo(
    () => buildFieldTodaySummary(tasks, photos, punchItems, todayIso, pendingSync),
    [tasks, photos, punchItems, todayIso, pendingSync],
  );

  // Apply search + status filter to table rows
  const filtered = useMemo(() => {
    let rows = s.tableRows;
    if (statusFilter && statusFilter !== "all") {
      rows = rows.filter((r) => r.urgencyBucket === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.activity.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.reportedBy.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [s.tableRows, statusFilter, search]);

  // ── Hero summary chips ──
  const chips = [
    { label: `${s.kpis.todaysTasks} Tasks` },
    { label: `${s.kpis.overdueTasks} Overdue`, tone: s.kpis.overdueTasks ? "danger" as const : "neutral" as const },
    { label: `${s.kpis.photosToday} Photos Today` },
  ];

  // ── KPI strip ──
  // SUBSTITUTIONS (no real source exists for weather/worker-headcount/safety-alerts/deliveries):
  //   [0] Today's Tasks      = kpis.todaysTasks       (REAL: schedule_tasks count via tasksForToday)
  //   [1] Overdue Tasks      = kpis.overdueTasks       (REAL: taskUrgency="overdue" count)
  //   [2] Completed Today    = kpis.completedToday     (REAL: percent_complete=100 in todaysWork)
  //   [3] Open Punch Items   = kpis.openPunchItems     (REAL: PunchlistItem.status != closed set)
  //   [4] Photos Today       = kpis.photosToday        (REAL: Photo.taken_date = todayIso)
  const kpiCells: KpiCellDef[] = [
    {
      label: "Today's Tasks",
      value: s.kpis.todaysTasks,
      sublabel: "scheduled",
      tone: "neutral" as KpiTone,
      Icon: CalendarCheck,
    },
    {
      label: "Overdue",
      value: s.kpis.overdueTasks,
      sublabel: "tasks",
      tone: (s.kpis.overdueTasks > 0 ? "danger" : "neutral") as KpiTone,
      Icon: AlertTriangle,
    },
    {
      label: "Completed",
      value: s.kpis.completedToday,
      sublabel: "today",
      tone: (s.kpis.completedToday > 0 ? "good" : "neutral") as KpiTone,
      Icon: CheckCircle2,
    },
    {
      label: "Open Punch Items",
      value: s.kpis.openPunchItems,
      sublabel: "items",
      tone: (s.kpis.openPunchItems > 0 ? "warn" : "neutral") as KpiTone,
      Icon: ClipboardCheck,
    },
    {
      label: "Photos Today",
      value: s.kpis.photosToday,
      sublabel: "captured",
      tone: "neutral" as KpiTone,
      Icon: Camera,
    },
  ];

  // ── DataTable columns ──
  const columns: Column<FieldTaskRow>[] = [
    {
      key: "time",
      header: "Due Date",
      render: (r) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.time}</span>
      ),
    },
    {
      key: "activity",
      header: "Activity",
      render: (r) => (
        <span style={{ fontWeight: 600 }}>{r.activity}</span>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (r) => r.location || <span style={{ color: "var(--cmd-text-muted)" }}>—</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Pill tone={statusTone(r.status)}>{r.status}</Pill>,
    },
    {
      key: "urgency",
      header: "Urgency",
      render: (r) => (
        <Pill tone={urgencyTone(r.urgencyBucket)}>
          {URGENCY_DISPLAY[r.urgencyBucket]?.label ?? r.urgencyBucket}
        </Pill>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
          {/* Mini progress bar */}
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: "var(--cmd-border)",
              overflow: "hidden",
              minWidth: 40,
            }}
          >
            <div
              style={{
                width: `${r.pct}%`,
                height: "100%",
                background: URGENCY_DISPLAY[r.urgencyBucket]?.color ?? "var(--accent)",
                transition: "width 120ms ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 800,
              minWidth: 30,
              textAlign: "right",
              color: "var(--cmd-text)",
            }}
          >
            {r.pct}%
          </span>
        </div>
      ),
    },
    {
      key: "quickset",
      header: "Quick Set",
      render: (r) => {
        // Annotate the raw task with its urgency bucket so ProgressButtons can read it
        const annotated = { ...r._task, __urgencyBucket: r.urgencyBucket };
        return (
          <ProgressButtons
            task={annotated}
            saving={savingTaskId === r.id}
            onSetProgress={(pct) => onSetProgress(r._task, pct)}
          />
        );
      },
    },
    {
      key: "nextAction",
      header: "Next Action",
      render: (r) => (
        <span style={{ color: "var(--cmd-text-muted)", fontSize: 12 }}>{r.nextAction}</span>
      ),
    },
    {
      key: "reportedBy",
      header: "Crew",
      render: (r) =>
        r.reportedBy ? (
          r.reportedBy
        ) : (
          <span style={{ color: "var(--cmd-text-muted)" }}>—</span>
        ),
    },
  ];

  return (
    <div className="field-today-cc">
      {/* Offline sync banner — only when pendingSync > 0 */}
      {pendingSync > 0 && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 16px",
            marginBottom: 8,
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--status-warning) 40%, var(--cmd-border))",
            background: "color-mix(in srgb, var(--status-warning) 10%, var(--cmd-surface))",
            fontSize: 12,
            color: "var(--cmd-text)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <WifiOff size={14} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
            {pendingSync} update{pendingSync === 1 ? "" : "s"} saved offline — syncs when you reconnect
          </span>
          <button
            type="button"
            onClick={onFlushOutbox}
            style={{
              flexShrink: 0,
              minHeight: 28,
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid var(--status-warning)",
              background: "transparent",
              color: "var(--status-warning)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Sync now
          </button>
        </div>
      )}

      <PageHero
        Icon={CalendarCheck}
        title="Field Today"
        subtitle="Daily field overview — activities, safety, and coordination."
        projectName={projectName}
        chips={chips}
        photoSrc={photoFor("FieldToday") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      {/* Quick-capture actions row — sits between KPI strip and panels */}
      <div
        style={{
          display: "flex",
          gap: 8,
          margin: "0 0 16px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onAddPunch}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            fontWeight: 700,
            borderColor: "var(--status-warning)",
            color: "var(--status-warning)",
          }}
        >
          <ClipboardCheck size={14} />
          Add Punch
        </button>
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onAddPhoto}
          disabled={uploadingPhoto}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            fontWeight: 700,
            opacity: uploadingPhoto ? 0.6 : 1,
          }}
        >
          <Camera size={14} />
          {uploadingPhoto ? "Uploading…" : "Photo"}
        </button>
        <button
          type="button"
          className="cmd-chip-btn is-action"
          onClick={onDailyLog}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            fontWeight: 700,
          }}
        >
          <ClipboardList size={14} />
          Daily Log
        </button>
      </div>

      <div className="cmd-panels">
        {/* Panel 1: Today's Plan */}
        <DecisionPanel title="Today's Plan" onViewAll={() => { onStatusFilter("all"); scrollToTable(); }}>
          {isLoading ? (
            <div className="cmd-row__meta">Loading tasks…</div>
          ) : s.planQueue.length === 0 ? (
            <div className="cmd-row__meta">No open tasks for today.</div>
          ) : (
            s.planQueue.map((task) => {
              const taskId = String(task.id || "");
              const row = s.tableRows.find((r) => r.id === taskId);
              const bucket = row?.urgencyBucket ?? "active";
              const display = URGENCY_DISPLAY[bucket];
              const pct = clampPercent(task.percent_complete);
              return (
                <div className="cmd-row" key={taskId}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cmd-row__num" style={{ fontSize: 13 }}>
                      {row?.activity ?? String(task.task_name || task.name || "(task)")}
                    </div>
                    <div className="cmd-row__meta">
                      {row?.location || "No location"} · {row?.time ?? "TBD"}
                    </div>
                    {/* Mini progress bar */}
                    <div
                      style={{
                        marginTop: 6,
                        height: 4,
                        borderRadius: 999,
                        background: "var(--cmd-border)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: display.color,
                          transition: "width 120ms ease",
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Pill tone={urgencyTone(bucket)}>{display.label}</Pill>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 800,
                        color: "var(--cmd-text)",
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </DecisionPanel>

        {/* Panel 2: Crew Status — task completion ring + open punch items */}
        <DecisionPanel
          title="Crew Status"
          onViewAll={() => {
            // Navigate user toward open punch items
            scrollToTable();
          }}
        >
          {/* Completion ring (inline SVG, real value: taskCompletionPct) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "8px 0 12px",
              borderBottom: "1px solid var(--cmd-border)",
              marginBottom: 8,
            }}
          >
            <CompletionRing pct={s.taskCompletionPct} />
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--cmd-text)",
                  lineHeight: 1,
                }}
              >
                {s.taskCompletionPct}%
              </div>
              <div className="cmd-row__meta" style={{ marginTop: 2 }}>
                Task completion today
              </div>
              <div className="cmd-row__meta" style={{ marginTop: 2 }}>
                {s.kpis.completedToday} of {s.kpis.todaysTasks} done
              </div>
            </div>
          </div>

          {/* Open punch items */}
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--cmd-text-muted)",
              marginBottom: 6,
            }}
          >
            Open Punch Items
          </div>
          {s.openPunchRows.length === 0 ? (
            <div className="cmd-row__meta">No open punch items.</div>
          ) : (
            s.openPunchRows.map((p) => (
              <div className="cmd-row" key={p.id}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cmd-row__num" style={{ fontSize: 12 }}>{p.title}</div>
                  <div className="cmd-row__meta">{p.location || "No location"}</div>
                </div>
                {p.priority && (
                  <Pill
                    tone={
                      p.priority === "High" || p.priority === "Critical"
                        ? "danger"
                        : p.priority === "Medium"
                        ? "warn"
                        : "neutral"
                    }
                  >
                    {p.priority}
                  </Pill>
                )}
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3: Daily Photos */}
        <DecisionPanel
          title="Daily Photos"
          onViewAll={() => {
            // Real action: the Photos page is at /Photos
            window.location.assign(`/Photos?date=${todayIso}`);
          }}
        >
          {s.photoThumbnails.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "16px 0",
                gap: 8,
              }}
            >
              <ImageIcon size={28} style={{ opacity: 0.3 }} />
              <div className="cmd-row__meta">No photos captured today.</div>
              <button
                type="button"
                className="cmd-chip-btn is-action"
                onClick={onAddPhoto}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  padding: "6px 12px",
                }}
              >
                <Camera size={12} />
                Snap a photo
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {s.photoThumbnails.map((p) => (
                  <div
                    key={p.id}
                    title={p.title ?? "Field photo"}
                    style={{
                      aspectRatio: "1 / 1",
                      borderRadius: 6,
                      overflow: "hidden",
                      background: "var(--cmd-border)",
                      border: "1px solid var(--cmd-border)",
                    }}
                  >
                    <PhotoThumb fileUrl={p.fileUrl ?? null} title={p.title ?? null} />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="cmd-chip-btn"
                onClick={onAddPhoto}
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "6px 0",
                }}
              >
                <Camera size={12} />
                Add more photos
              </button>
            </>
          )}
        </DecisionPanel>
      </div>

      {/* FilterBar + DataTable */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search tasks by name, location, or crew…"
        primaryLabel="Log Activity"
        onPrimary={onDailyLog}
        filters={
          <>
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.value}
                type="button"
                className={`cmd-chip-btn${statusFilter === chip.value ? " is-active" : ""}`}
                onClick={() => onStatusFilter(chip.value)}
              >
                {chip.label}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={undefined}
        emptyMessage="No tasks match your filters."
      />
    </div>
  );
}

// ── Inline SVG completion ring ────────────────────────────────────────────────

function CompletionRing({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const isComplete = pct >= 100;
  const color = isComplete ? "var(--status-success, #22c55e)" : pct > 0 ? "var(--accent)" : "var(--cmd-border)";

  return (
    <svg
      width={52}
      height={52}
      viewBox="0 0 52 52"
      aria-label={`${pct}% complete`}
      style={{ flexShrink: 0 }}
    >
      {/* Track */}
      <circle
        cx={26}
        cy={26}
        r={r}
        fill="none"
        stroke="var(--cmd-border)"
        strokeWidth={5}
      />
      {/* Fill */}
      <circle
        cx={26}
        cy={26}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dasharray 300ms ease" }}
      />
    </svg>
  );
}
