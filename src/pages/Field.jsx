/**
 * Field.jsx — Field operations hub.
 *
 * Single landing page that pulls together the seven field surfaces
 * (Daily Logs / Photos / Inspections / Safety / Quality Control /
 * LEMs / Punchlist) so a project superintendent can answer "what's
 * happening on the job today?" in one glance instead of bouncing
 * between half a dozen pages.
 *
 * Layout (top → bottom):
 *   1. CommandBar — title + project eyebrow + today's-activity count
 *   2. KPI tile-strip (6 tiles, click → deep-link)
 *   3. Two-column body
 *        Left:  Today's Activity — recent daily-log preview + week feed
 *        Right: Action Items     — open punch / inspections /
 *                                  unresolved safety, sorted by date
 *   4. Photo strip — 8-12 most recent photos as thumbnails
 *
 * Every clickable surface deep-links into the relevant entity page so
 * this hub is purely a read view — no creation flows live here apart
 * from the "Log Today" CTA that opens DailyLogs?new=1 when no log
 * exists for today.
 *
 * Design rules (CLAUDE.md):
 *   - No purple, no pink — accent / status tokens only
 *   - Filter is_deleted on every list (inherited from entity
 *     soft-delete contract; defensive in the in-page useMemo too)
 *   - TanStack Query + entity clients + inline style objects
 */

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { CommandBar, KpiTile } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { buildDeliveryMetrics } from "./deliveries/analytics";
import {
  ClipboardList,
  Camera,
  ShieldCheck,
  AlertTriangle,
  TestTube2,
  CheckSquare,
  Truck,
  Plus,
  ArrowRight,
  CalendarDays,
  Cloud,
  Users,
  AlertOctagon,
  ListChecks,
} from "lucide-react";
import { localToday } from "@/utils/dates";

const today = localToday;

function startOfWeekISO() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
}

function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function startOfYearISO() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function fmtShortDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

export default function Field() {
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const navigate = useNavigate();

  // ── Data fetches — project-scoped where a project is active, otherwise
  // global. Empty arrays make every downstream calculation safe. ──
  const filterArgs = projectId ? { project_id: projectId } : null;

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["field-hub-daily-logs", projectId],
    queryFn: () => filterArgs
      ? entities.DailyLog.filter(filterArgs, "-date")
      : entities.DailyLog.list("-date"),
    staleTime: 30 * 1000,
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ["field-hub-photos", projectId],
    queryFn: () => filterArgs
      ? entities.Photo.filter(filterArgs, "-taken_date")
      : entities.Photo.list("-taken_date"),
    staleTime: 30 * 1000,
  });

  const { data: punchlist = [], isLoading: punchlistLoading } = useQuery({
    queryKey: ["field-hub-punchlist", projectId],
    queryFn: () => filterArgs
      ? entities.PunchlistItem.filter(filterArgs)
      : entities.PunchlistItem.list(),
    staleTime: 30 * 1000,
  });

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery({
    queryKey: ["field-hub-inspections", projectId],
    queryFn: () => filterArgs
      ? entities.Inspection.filter(filterArgs, "-inspection_date")
      : entities.Inspection.list("-inspection_date"),
    staleTime: 30 * 1000,
  });

  const { data: safety = [], isLoading: safetyLoading } = useQuery({
    queryKey: ["field-hub-safety", projectId],
    queryFn: () => filterArgs
      ? entities.SafetyIncident.filter(filterArgs, "-incident_date")
      : entities.SafetyIncident.list("-incident_date"),
    staleTime: 30 * 1000,
  });

  const { data: qc = [], isLoading: qcLoading } = useQuery({
    queryKey: ["field-hub-qc", projectId],
    queryFn: () => filterArgs
      ? entities.QualityControlRecord.filter(filterArgs, "-test_date")
      : entities.QualityControlRecord.list("-test_date"),
    staleTime: 30 * 1000,
  });

  const { data: deliveries = [], isLoading: deliveriesLoading } = useQuery({
    queryKey: ["field-hub-deliveries", projectId],
    queryFn: () => filterArgs
      ? entities.Delivery.filter(filterArgs, "-scheduled_date")
      : entities.Delivery.list("-scheduled_date"),
    staleTime: 30 * 1000,
  });

  const isLoading = logsLoading || photosLoading || punchlistLoading
    || inspectionsLoading || safetyLoading || qcLoading || deliveriesLoading;

  // ── Derived metrics ──
  const todayIso = today();
  const weekStart = startOfWeekISO();
  const monthStart = startOfMonthISO();
  const yearStart = startOfYearISO();

  // Defensive in-memory is_deleted filter — the entity client already
  // skips deleted rows on filter/list, but a stale cache from an
  // earlier session could surface them. Belt + suspenders.
  const liveLogs        = useMemo(() => logs.filter((r) => !r.is_deleted), [logs]);
  const livePhotos      = useMemo(() => photos.filter((r) => !r.is_deleted), [photos]);
  const livePunchlist   = useMemo(() => punchlist.filter((r) => !r.is_deleted), [punchlist]);
  const liveInspections = useMemo(() => inspections.filter((r) => !r.is_deleted), [inspections]);
  const liveSafety      = useMemo(() => safety.filter((r) => !r.is_deleted), [safety]);
  const liveQC          = useMemo(() => qc.filter((r) => !r.is_deleted), [qc]);
  const liveDeliveries  = useMemo(() => deliveries.filter((r) => !r.is_deleted), [deliveries]);

  const deliveryMetrics = useMemo(
    () => buildDeliveryMetrics(liveDeliveries, []),
    [liveDeliveries],
  );

  const todayLog = useMemo(
    () => liveLogs.find((l) => String(l.date || "").slice(0, 10) === todayIso) || null,
    [liveLogs, todayIso],
  );

  const photosToday = useMemo(
    () => livePhotos.filter((p) => String(p.taken_date || p.created_at || "").slice(0, 10) === todayIso).length,
    [livePhotos, todayIso],
  );

  const photosThisWeek = useMemo(
    () => livePhotos.filter((p) => String(p.taken_date || p.created_at || "").slice(0, 10) >= weekStart).length,
    [livePhotos, weekStart],
  );

  const openPunch = useMemo(
    () => livePunchlist.filter((p) => p.status !== "Completed" && p.status !== "Cancelled" && p.status !== "Deferred").length,
    [livePunchlist],
  );

  const openInspections = useMemo(
    () => liveInspections.filter((i) => i.status === "Scheduled" || i.status === "In Progress").length,
    [liveInspections],
  );

  const safetyYTD = useMemo(
    () => liveSafety.filter((i) => String(i.incident_date || "").slice(0, 10) >= yearStart).length,
    [liveSafety, yearStart],
  );

  const qcThisMonth = useMemo(
    () => liveQC.filter((r) => String(r.test_date || "").slice(0, 10) >= monthStart).length,
    [liveQC, monthStart],
  );

  // Today's-activity headline count
  const todayActivityCount = useMemo(() => {
    let n = 0;
    n += todayLog ? 1 : 0;
    n += photosToday;
    n += livePunchlist.filter((p) => String(p.created_at || "").slice(0, 10) === todayIso).length;
    n += liveInspections.filter((i) => String(i.inspection_date || "").slice(0, 10) === todayIso).length;
    n += liveSafety.filter((s) => String(s.incident_date || "").slice(0, 10) === todayIso).length;
    n += deliveryMetrics.dueToday.length;
    return n;
  }, [todayLog, photosToday, livePunchlist, liveInspections, liveSafety, todayIso, deliveryMetrics.dueToday.length]);

  // ── Action Items feed (open punch / open inspections / unresolved safety) ──
  const actionFeed = useMemo(() => {
    const items = [];
    for (const p of livePunchlist) {
      if (p.status === "Completed" || p.status === "Cancelled" || p.status === "Deferred") continue;
      items.push({
        key: `punch-${p.id}`,
        type: "punch",
        date: p.target_completion_date || p.created_at,
        title: p.description || "(no description)",
        sub: p.location || "",
        status: p.status,
        priority: p.priority,
        color: p.priority === "Critical" ? "var(--status-error)"
          : p.priority === "High" ? "var(--status-warning)"
          : "var(--accent)",
        onClick: () => navigate(`/Punchlist?id=${p.id}`),
      });
    }
    for (const i of liveInspections) {
      if (i.status !== "Scheduled" && i.status !== "In Progress") continue;
      items.push({
        key: `insp-${i.id}`,
        type: "inspection",
        date: i.inspection_date || i.created_at,
        title: `${i.inspection_type || "Inspection"}${i.location ? ` · ${i.location}` : ""}`,
        sub: i.inspector_name || "",
        status: i.status,
        color: "var(--status-info)",
        onClick: () => navigate(`/Inspections?id=${i.id}`),
      });
    }
    for (const s of liveSafety) {
      if (s.status === "Closed" || s.status === "Completed") continue;
      items.push({
        key: `safety-${s.id}`,
        type: "safety",
        date: s.incident_date || s.created_at,
        title: `${s.severity || ""} ${s.incident_type || "Incident"}`.trim(),
        sub: s.location || "",
        status: s.status,
        color: s.severity === "Critical" ? "var(--status-error)"
          : s.severity === "High" ? "var(--status-warning)"
          : "var(--status-info)",
        onClick: () => navigate(`/Safety?id=${s.id}`),
      });
    }
    for (const d of deliveryMetrics.exceptions.slice(0, 8)) {
      items.push({
        key: `delivery-${d.id}`,
        type: "delivery",
        date: d.scheduled_date || d.required_date || d.created_at,
        title: d.delivery_title || d.load_number || d.vendor || "Delivery exception",
        sub: d._signals?.flags?.[0]?.label || d.receiving_location || "",
        status: d.status,
        color: d._signals?.risk === "high" ? "var(--status-error)"
          : d._signals?.risk === "medium" ? "var(--status-warning)"
          : "var(--phase-delivery)",
        onClick: () => navigate("/Deliveries?receive=1"),
      });
    }
    items.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return items;
  }, [livePunchlist, liveInspections, liveSafety, deliveryMetrics.exceptions, navigate]);

  // 7-day activity bars (events per day) for the mini chart in this week section
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
      let count = 0;
      count += liveLogs.filter((l) => String(l.date || "").slice(0, 10) === iso).length;
      count += livePhotos.filter((p) => String(p.taken_date || "").slice(0, 10) === iso).length;
      count += livePunchlist.filter((p) => String(p.created_at || "").slice(0, 10) === iso).length;
      count += liveInspections.filter((i) => String(i.inspection_date || "").slice(0, 10) === iso).length;
      count += liveDeliveries.filter((delivery) => String(delivery.scheduled_date || "").slice(0, 10) === iso).length;
      days.push({ iso, day: dayOfWeek, count });
    }
    return days;
  }, [liveLogs, livePhotos, livePunchlist, liveInspections, liveDeliveries]);

  const recentLogs = useMemo(
    () => [...liveLogs]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 4),
    [liveLogs],
  );

  const recentPhotos = useMemo(() => livePhotos.slice(0, 12), [livePhotos]);

  const tiles = [
    {
      key: "log-today",
      label: "Daily Log Today",
      value: todayLog ? "✓" : "—",
      color: todayLog ? "var(--status-success-bright)" : "var(--text-muted)",
      icon: ClipboardList,
      onClick: () => navigate(todayLog ? "/DailyLogs" : "/DailyLogs?new=1"),
      sub: todayLog ? `${todayLog.headcount || 0} crew` : "log not started",
    },
    {
      key: "photos-week",
      label: "Photos · Week",
      value: photosThisWeek,
      color: "var(--accent)",
      icon: Camera,
      onClick: () => navigate("/Photos"),
    },
    {
      key: "open-punch",
      label: "Open Punch",
      value: openPunch,
      color: openPunch > 0 ? "var(--status-warning-bright)" : "var(--status-success-bright)",
      icon: CheckSquare,
      onClick: () => navigate("/Punchlist"),
    },
    {
      key: "open-insp",
      label: "Open Inspections",
      value: openInspections,
      color: openInspections > 0 ? "var(--status-info)" : "var(--text-muted)",
      icon: ShieldCheck,
      onClick: () => navigate("/Inspections"),
    },
    {
      key: "safety-ytd",
      label: "Safety · YTD",
      value: safetyYTD,
      color: safetyYTD > 0 ? "var(--status-error-bright)" : "var(--status-success-bright)",
      icon: AlertTriangle,
      onClick: () => navigate("/Safety"),
    },
    {
      key: "qc-month",
      label: "QC · Month",
      value: qcThisMonth,
      color: "var(--phase-fabrication)",
      icon: TestTube2,
      onClick: () => navigate("/QualityControl"),
    },
    {
      key: "delivery-today",
      label: "Loads Today",
      value: deliveryMetrics.dueToday.length,
      color: deliveryMetrics.overdue.length > 0 ? "var(--status-error-bright)" : "var(--phase-delivery)",
      icon: Truck,
      onClick: () => navigate("/Deliveries?receive=1"),
      sub: deliveryMetrics.overdue.length > 0 ? `${deliveryMetrics.overdue.length} late` : `${deliveryMetrics.openCount} open`,
    },
  ];

  const fastActions = [
    {
      key: "daily-log",
      label: todayLog ? "Open Log" : "Log Today",
      sub: todayLog ? `${todayLog.headcount || 0} crew recorded` : "Crew, hours, weather",
      icon: ClipboardList,
      color: todayLog ? "var(--status-success-bright)" : "var(--accent)",
      onClick: () => navigate(todayLog ? "/DailyLogs" : "/DailyLogs?new=1"),
    },
    {
      key: "photo",
      label: "Add Photo",
      sub: photosToday ? `${photosToday} today` : "Progress or issue",
      icon: Camera,
      color: "var(--accent)",
      onClick: () => navigate("/Photos?new=1"),
    },
    {
      key: "punch",
      label: "Punch Item",
      sub: openPunch ? `${openPunch} open` : "Create close-out item",
      icon: CheckSquare,
      color: openPunch ? "var(--status-warning-bright)" : "var(--status-success-bright)",
      onClick: () => navigate("/Punchlist?new=1"),
    },
    {
      key: "safety",
      label: "Safety",
      sub: safetyYTD ? `${safetyYTD} YTD` : "Hazard or incident",
      icon: AlertTriangle,
      color: safetyYTD ? "var(--status-error-bright)" : "var(--status-success-bright)",
      onClick: () => navigate("/Safety?new=1"),
    },
    {
      key: "delivery",
      label: "Delivery",
      sub: deliveryMetrics.overdue.length
        ? `${deliveryMetrics.overdue.length} late`
        : `${deliveryMetrics.dueToday.length} due today`,
      icon: Truck,
      color: deliveryMetrics.overdue.length ? "var(--status-error-bright)" : "var(--phase-delivery)",
      onClick: () => navigate("/Deliveries?receive=1"),
    },
  ];

  return (
    <div className="sb-dashboard-reference-page field-mobile-console" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={activeProject ? activeProject.name : "ALL PROJECTS"}
        title="Field"
        count={todayActivityCount}
        unit=" · TODAY"
        subtitle={
          todayLog
            ? `${todayLog.headcount || 0} crew · ${todayLog.hours_worked || 0} hrs · ${recentPhotos.length} recent photos`
            : "No log today — log first to start tracking man-hours"
        }
      >
        {!todayLog && projectId && (
          <button
            onClick={() => navigate("/DailyLogs?new=1")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--accent)",
              color: "var(--bg-base)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "8px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
          >
            <Plus size={12} /> Log Today
          </button>
        )}
      </CommandBar>

      <FieldFastCaptureRail actions={fastActions} />

      <TodayExecutionStrip
        todayLog={todayLog}
        photosToday={photosToday}
        openPunch={openPunch}
        safetyOpen={liveSafety.filter((s) => s.status !== "Closed" && s.status !== "Completed").length}
        deliveryDueToday={deliveryMetrics.dueToday.length}
        deliveryLate={deliveryMetrics.overdue.length}
      />

      {/* KPI tile-strip */}
      <div className="field-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {tiles.map((t) => (
          <KpiTile
            key={t.key}
            compact
            label={t.label}
            value={t.value}
            sub={t.sub}
            color={t.color}
            onClick={t.onClick}
          />
        ))}
      </div>

      {/* 7-day activity sparkline */}
      <WeekActivityStrip days={weekDays} />

      {isLoading ? (
        <LoadingSkeleton variant="page" />
      ) : (
        <>
          {/* Two-column body: Today's Activity / Action Items */}
          <div className="field-hub-grid" style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}>
            <SubPanel
              title="Today's Activity"
              icon={ClipboardList}
              cta={projectId ? {
                label: todayLog ? "Open Daily Log" : "+ Log Today",
                onClick: () => navigate(todayLog ? `/DailyLogs?id=${todayLog.id}` : "/DailyLogs?new=1"),
              } : null}
            >
              {todayLog ? (
                <DailyLogPreview log={todayLog} onClick={() => navigate(`/DailyLogs?id=${todayLog.id}`)} />
              ) : (
                <EmptyHint
                  text={projectId
                    ? "No log yet — log first to start tracking man-hours, weather, and crew."
                    : "Select a project to see today's activity."}
                />
              )}

              {recentLogs.length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <SectionLabel>This Week's Logs</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                    {recentLogs.slice(todayLog ? 1 : 0).slice(0, 4).map((log) => (
                      <LogFeedRow
                        key={log.id}
                        log={log}
                        onClick={() => navigate(`/DailyLogs?id=${log.id}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </SubPanel>

            <SubPanel
              title="Action Items"
              icon={ListChecks}
              count={actionFeed.length}
            >
              {actionFeed.length === 0 ? (
                <EmptyHint text="No open punch, inspections, safety, or delivery exceptions." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
                  {actionFeed.slice(0, 12).map((item) => (
                    <ActionRow key={item.key} item={item} />
                  ))}
                </div>
              )}
            </SubPanel>
          </div>

          {/* Photo strip */}
          <SubPanel
            title="Recent Photos"
            icon={Camera}
            count={livePhotos.length}
            cta={{
              label: "Open Photos",
              onClick: () => navigate("/Photos"),
            }}
          >
            {recentPhotos.length === 0 ? (
              <EmptyHint text="No photos uploaded yet." />
            ) : (
              <div style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
              }}>
                {recentPhotos.map((p) => (
                  <PhotoThumb
                    key={p.id}
                    photo={p}
                    onClick={() => navigate("/Photos")}
                  />
                ))}
              </div>
            )}
          </SubPanel>
        </>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function FieldFastCaptureRail({ actions }) {
  return (
    <div className="field-fast-capture-rail" aria-label="Field quick actions">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="field-fast-action"
            onClick={action.onClick}
            style={{ "--field-action-color": action.color }}
            aria-label={action.label}
          >
            <span className="field-fast-action-icon">
              <Icon size={18} />
            </span>
            <span className="field-fast-action-copy">
              <strong>{action.label}</strong>
              <small>{action.sub}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TodayExecutionStrip({
  todayLog,
  photosToday,
  openPunch,
  safetyOpen,
  deliveryDueToday,
  deliveryLate,
}) {
  const stats = [
    {
      key: "crew",
      label: "Crew",
      value: todayLog ? todayLog.headcount || 0 : "TBD",
      tone: todayLog ? "var(--status-success-bright)" : "var(--text-muted)",
    },
    {
      key: "hours",
      label: "Hours",
      value: todayLog ? todayLog.hours_worked || 0 : "TBD",
      tone: todayLog ? "var(--status-success-bright)" : "var(--text-muted)",
    },
    { key: "photos", label: "Photos", value: photosToday, tone: "var(--accent)" },
    {
      key: "punch",
      label: "Open Punch",
      value: openPunch,
      tone: openPunch ? "var(--status-warning-bright)" : "var(--status-success-bright)",
    },
    {
      key: "safety",
      label: "Open Safety",
      value: safetyOpen,
      tone: safetyOpen ? "var(--status-error-bright)" : "var(--status-success-bright)",
    },
    {
      key: "delivery",
      label: "Loads",
      value: deliveryLate ? `${deliveryLate} late` : deliveryDueToday,
      tone: deliveryLate ? "var(--status-error-bright)" : "var(--phase-delivery)",
    },
  ];

  return (
    <div className="field-today-strip" aria-label="Today's field execution status">
      {stats.map((stat) => (
        <div key={stat.key} className="field-today-stat" style={{ "--field-stat-color": stat.tone }}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  );
}

function SubPanel({ title, icon: IconCmp, count, cta, children }) {
  return (
    <div className="field-sub-panel" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: 16,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {IconCmp && <IconCmp size={14} color="var(--accent)" />}
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {title}
            {Number.isFinite(count) && (
              <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>· {count}</span>
            )}
          </span>
        </div>
        {cta && (
          <button
            onClick={cta.onClick}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {cta.label} <ArrowRight size={10} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      fontWeight: 700,
      color: "var(--text-muted)",
      letterSpacing: "0.10em",
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{
      fontFamily: "var(--font-body)",
      fontSize: 12,
      color: "var(--text-muted)",
      fontStyle: "italic",
      textAlign: "center",
      padding: "20px 8px",
    }}>
      {text}
    </div>
  );
}

function DailyLogPreview({ log, onClick }) {
  const photos = safeArray(log.photos);
  return (
    <div
      className="field-daily-log-preview"
      onClick={onClick}
      style={{
        padding: 12,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}>
          {fmtShortDate(log.date)} · TODAY
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
        }}>
          {log.superintendent || "—"}
        </span>
      </div>
      <div className="field-log-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
        <Stat icon={Users}        label="Crew"     value={log.headcount || 0} />
        <Stat icon={CalendarDays} label="Hours"    value={log.hours_worked || 0} />
        <Stat icon={Cloud}        label="Weather"  value={log.weather_description || "—"} small />
        <Stat icon={AlertOctagon} label="Incidents" value={log.safety_incidents || 0} />
      </div>
      {log.activities && (
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          maxHeight: 64,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}>
          {log.activities}
        </div>
      )}
      {photos.length > 0 && (
        <div style={{
          marginTop: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--accent)",
        }}>
          📷 {photos.length} photo{photos.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: IconCmp, label, value, small }) {
  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        {IconCmp && <IconCmp size={9} />}
        {label}
      </div>
      <div style={{
        fontFamily: small ? "var(--font-body)" : "var(--font-mono)",
        fontSize: small ? 11 : 14,
        fontWeight: 600,
        color: "var(--text-primary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

function LogFeedRow({ log, onClick }) {
  return (
    <div
      className="field-log-feed-row"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderRadius: 4,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--divider)")}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--accent)",
        letterSpacing: "0.06em",
      }}>
        {fmtShortDate(log.date)}
      </span>
      <span style={{
        flex: 1,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        color: "var(--text-secondary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {log.activities || "(no narrative)"}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
      }}>
        {log.headcount || 0}× · {log.hours_worked || 0}h
      </span>
      {safeArray(log.photos).length > 0 && (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--accent)",
        }}>
          📷 {safeArray(log.photos).length}
        </span>
      )}
    </div>
  );
}

function ActionRow({ item }) {
  return (
    <div
      className="field-action-row"
      onClick={item.onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        background: "var(--bg-page)",
        border: "1px solid var(--divider)",
        borderLeft: `3px solid ${item.color}`,
        borderRadius: 4,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--divider)")}
    >
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: item.color,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        minWidth: 56,
      }}>
        {item.type}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        {item.sub && (
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
          }}>
            {item.sub}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
      }}>
        {fmtShortDate(item.date)}
      </span>
    </div>
  );
}

function PhotoThumb({ photo, onClick }) {
  const url = photo.file_url || photo.path || "";
  return (
    <div
      className="field-photo-thumb"
      onClick={onClick}
      title={photo.title || photo.file_name || ""}
      style={{
        width: 88,
        height: 88,
        flexShrink: 0,
        borderRadius: 6,
        border: "1px solid var(--border-default)",
        overflow: "hidden",
        background: "var(--bg-input)",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {url && (
        <img
          src={url}
          alt={photo.title || photo.file_name || "photo"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      {photo.category && (
        <div style={{
          position: "absolute",
          bottom: 2,
          left: 2,
          right: 2,
          background: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
          color: "var(--text-on-accent)",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "2px 4px",
          borderRadius: 2,
          textAlign: "center",
        }}>
          {photo.category}
        </div>
      )}
    </div>
  );
}

function WeekActivityStrip({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  return (
    <div className="field-week-strip" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: "12px 16px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.10em",
          textTransform: "uppercase",
        }}>
          7-Day Activity · {total} events
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 6,
        height: 50,
        alignItems: "end",
      }}>
        {days.map((d) => (
          <div key={d.iso} title={`${d.iso}: ${d.count} events`}>
            <div style={{
              height: `${Math.max(2, (d.count / max) * 40)}px`,
              background: d.count > 0 ? "var(--accent)" : "var(--border-default)",
              borderRadius: 2,
              transition: "height 0.2s",
            }} />
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: 4,
              letterSpacing: "0.06em",
            }}>
              {d.day}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
