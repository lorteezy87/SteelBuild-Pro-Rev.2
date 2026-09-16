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
  useCommandSkin,
} from "@/components/command";
import type { KpiCellDef, KpiTone } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import {
  buildFieldTodaySummary,
  filterFieldTaskRows,
  URGENCY_DISPLAY,
  ScheduleTaskRecord,
  PhotoRecord,
  PunchlistItemRecord,
} from "./fieldTodayControlCenter.derive";
import {
  FieldTodayCaptureActions,
  FieldTodayTaskFilters,
  useFieldTodayNavigation,
} from "./FieldTodayInteractions";
import FieldTodayTaskTable from "./FieldTodayTaskTable";

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
  /** A failed/paused refresh may still provide cached task rows for offline progress. */
  tasksUnavailable?: boolean;
  photosUnavailable?: boolean;
  punchItemsUnavailable?: boolean;
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function FieldTodayControlCenter(props: FieldTodayControlCenterProps) {
  const {
    projectName, todayIso, tasks, photos, punchItems,
    pendingSync, isLoading, search, onSearch, statusFilter, onStatusFilter,
    onSetProgress, onAddPunch, onAddPhoto, onDailyLog, onFlushOutbox,
    savingTaskId, uploadingPhoto,
    tasksUnavailable = false, photosUnavailable = false, punchItemsUnavailable = false,
  } = props;
  const taskEvidenceMissing = isLoading || tasksUnavailable;

  useCommandSkin();

  const s = useMemo(
    () => buildFieldTodaySummary(tasks, photos, punchItems, todayIso, pendingSync),
    [tasks, photos, punchItems, todayIso, pendingSync],
  );

  const filtered = useMemo(
    () => filterFieldTaskRows(s.tableRows, search, statusFilter),
    [s.tableRows, search, statusFilter],
  );
  const navigation = useFieldTodayNavigation({ todayIso, onStatusFilter });

  // ── Hero summary chips ──
  const chips = [
    { label: taskEvidenceMissing ? "Tasks unavailable" : `${s.kpis.todaysTasks} Tasks` },
    { label: taskEvidenceMissing ? "Recovery unavailable" : `${s.kpis.recoveryTasks} Recovery`, tone: !taskEvidenceMissing && s.kpis.recoveryTasks ? "danger" as const : "neutral" as const },
    { label: photosUnavailable ? "Photos unavailable" : `${s.kpis.photosToday} Photos Today` },
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
      value: taskEvidenceMissing ? "—" : s.kpis.todaysTasks,
      sublabel: taskEvidenceMissing ? "current total unavailable" : "due or active today",
      tone: "neutral" as KpiTone,
      Icon: CalendarCheck,
    },
    {
      label: "Recovery",
      value: taskEvidenceMissing ? "—" : s.kpis.recoveryTasks,
      sublabel: taskEvidenceMissing ? "current total unavailable" : "overdue tasks",
      tone: (!taskEvidenceMissing && s.kpis.recoveryTasks > 0 ? "danger" : "neutral") as KpiTone,
      Icon: AlertTriangle,
    },
    {
      label: "Completed Today",
      value: "—",
      sublabel: "completion time unavailable",
      tone: "neutral" as KpiTone,
      Icon: CheckCircle2,
    },
    {
      label: "Open Punch Items",
      value: punchItemsUnavailable ? "—" : s.kpis.openPunchItems,
      sublabel: punchItemsUnavailable ? "current total unavailable" : "items",
      tone: (!punchItemsUnavailable && s.kpis.openPunchItems > 0 ? "warn" : "neutral") as KpiTone,
      Icon: ClipboardCheck,
    },
    {
      label: "Photos Today",
      value: photosUnavailable ? "—" : s.kpis.photosToday,
      sublabel: photosUnavailable ? "current total unavailable" : "captured",
      tone: "neutral" as KpiTone,
      Icon: Camera,
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
              minHeight: 40,
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

      <FieldTodayCaptureActions
        onAddPunch={onAddPunch}
        onAddPhoto={onAddPhoto}
        onDailyLog={onDailyLog}
        uploadingPhoto={uploadingPhoto}
      />

      <div className="cmd-panels">
        {/* Panel 1: Today's Plan */}
        <DecisionPanel title="Today's Plan" onViewAll={navigation.showAllTasks}>
          {isLoading ? (
            <div className="cmd-row__meta">Loading tasks…</div>
          ) : s.planRows.length === 0 ? (
            <div className="cmd-row__meta">{tasksUnavailable ? "Task records unavailable." : "No open tasks for today."}</div>
          ) : (
            s.planRows.map((row) => {
              const bucket = row.urgencyBucket;
              const display = URGENCY_DISPLAY[bucket];
              const pct = row.pct;
              return (
                <div className="cmd-row" key={row.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cmd-row__num" style={{ fontSize: 13 }}>
                      {row.activity}
                    </div>
                    <div className="cmd-row__meta">
                      {row.location || "Location not provided"} · {row.time}
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
                          width: "100%",
                          height: "100%",
                          background: display.color,
                          transform: `scaleX(${pct / 100})`,
                          transformOrigin: "left",
                          transition: "transform 120ms ease",
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

        {/* Panel 2: Recovery Backlog — explicitly separate from today's plan */}
        <DecisionPanel title="Recovery Backlog">
          {isLoading ? (
            <div className="cmd-row__meta">Loading recovery work…</div>
          ) : s.recoveryRows.length === 0 ? (
            <div className="cmd-row__meta">{tasksUnavailable ? "Recovery records unavailable." : "No overdue schedule tasks."}</div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto", overscrollBehavior: "contain" }}>
              {s.recoveryRows.map((row) => (
                <div className="cmd-row" key={row.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cmd-row__num" style={{ fontSize: 13 }}>
                      {row.activity}
                    </div>
                    <div className="cmd-row__meta">
                      {row.location} · {row.dueDate}
                    </div>
                  </div>
                  <Pill tone="danger">OVERDUE</Pill>
                </div>
              ))}
            </div>
          )}
          {!taskEvidenceMissing && (s.planningGapCount > 0 || s.upcomingCount > 0) && (
            <div className="cmd-row__meta" style={{ marginTop: 8 }}>
              {s.planningGapCount} planning gap{s.planningGapCount === 1 ? "" : "s"} · {s.upcomingCount} starting within 7 days
            </div>
          )}
        </DecisionPanel>

        {/* Panel 3: Crew Status — today's average progress + open punch items */}
        <DecisionPanel
          title="Crew Status"
          onViewAll={navigation.showTaskTable}
        >
          {/* Progress ring (inline SVG, real value: today's average progress) */}
          {taskEvidenceMissing ? <div className="cmd-row__meta">Plan progress unavailable.</div> : <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "8px 0 12px",
              borderBottom: "1px solid var(--cmd-border)",
              marginBottom: 8,
            }}
          >
            <CompletionRing pct={s.todayProgressPct} />
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
                {s.todayProgressPct}%
              </div>
              <div className="cmd-row__meta" style={{ marginTop: 2 }}>
                Plan progress
              </div>
              <div className="cmd-row__meta" style={{ marginTop: 2 }}>
                Average across {s.kpis.todaysTasks} task{s.kpis.todaysTasks === 1 ? "" : "s"}
              </div>
            </div>
          </div>}

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
          {punchItemsUnavailable ? <div className="cmd-row__meta">Punch records unavailable.</div> : s.openPunchRows.length === 0 ? (
            <div className="cmd-row__meta">No open punch items.</div>
          ) : (
            s.openPunchRows.map((p) => (
              <div className="cmd-row" key={p.id}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cmd-row__num" style={{ fontSize: 12 }}>{p.title}</div>
                  <div className="cmd-row__meta">{p.location || "Location not provided"}</div>
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

        {/* Panel 4: Daily Photos */}
        <DecisionPanel
          title="Daily Photos"
          onViewAll={navigation.showDailyPhotos}
        >
          {photosUnavailable ? <div className="cmd-row__meta">Photo records unavailable.</div> : s.photoThumbnails.length === 0 ? (
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
                  minHeight: 40,
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
                  minHeight: 40,
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

      <FieldTodayTaskFilters
        search={search}
        onSearch={onSearch}
        statusFilter={statusFilter}
        onStatusFilter={onStatusFilter}
        onDailyLog={onDailyLog}
      />

      <div ref={navigation.tableRef}>
        {taskEvidenceMissing && s.tableRows.length === 0 ? <div className="cmd-row__meta">Task records unavailable.</div> : <FieldTodayTaskTable
          rows={filtered}
          savingTaskId={savingTaskId}
          onSetProgress={onSetProgress}
        />}
      </div>
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
