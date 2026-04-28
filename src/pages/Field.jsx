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
 *   - Filter is_deleted on every list (inherited from base44 entity
 *     soft-delete contract; defensive in the in-page useMemo too)
 *   - TanStack Query + base44 entities + inline style objects
 */

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { CommandBar, KpiTile } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import {
  ClipboardList,
  Camera,
  ShieldCheck,
  AlertTriangle,
  TestTube2,
  CheckSquare,
  Plus,
  ArrowRight,
  CalendarDays,
  Cloud,
  Users,
  AlertOctagon,
  ListChecks,
} from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);

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
      ? base44.entities.DailyLog.filter(filterArgs, "-date")
      : base44.entities.DailyLog.list("-date"),
    staleTime: 30 * 1000,
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ["field-hub-photos", projectId],
    queryFn: () => filterArgs
      ? base44.entities.Photo.filter(filterArgs, "-taken_date")
      : base44.entities.Photo.list("-taken_date"),
    staleTime: 30 * 1000,
  });

  const { data: punchlist = [], isLoading: punchlistLoading } = useQuery({
    queryKey: ["field-hub-punchlist", projectId],
    queryFn: () => filterArgs
      ? base44.entities.PunchlistItem.filter(filterArgs)
      : base44.entities.PunchlistItem.list(),
    staleTime: 30 * 1000,
  });

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery({
    queryKey: ["field-hub-inspections", projectId],
    queryFn: () => filterArgs
      ? base44.entities.Inspection.filter(filterArgs, "-inspection_date")
      : base44.entities.Inspection.list("-inspection_date"),
    staleTime: 30 * 1000,
  });

  const { data: safety = [], isLoading: safetyLoading } = useQuery({
    queryKey: ["field-hub-safety", projectId],
    queryFn: () => filterArgs
      ? base44.entities.SafetyIncident.filter(filterArgs, "-incident_date")
      : base44.entities.SafetyIncident.list("-incident_date"),
    staleTime: 30 * 1000,
  });

  const { data: qc = [], isLoading: qcLoading } = useQuery({
    queryKey: ["field-hub-qc", projectId],
    queryFn: () => filterArgs
      ? base44.entities.QualityControlRecord.filter(filterArgs, "-test_date")
      : base44.entities.QualityControlRecord.list("-test_date"),
    staleTime: 30 * 1000,
  });

  const isLoading = logsLoading || photosLoading || punchlistLoading
    || inspectionsLoading || safetyLoading || qcLoading;

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

  const todayLog = useMemo(
    () => liveLogs.find((l) => String(l.date || "").slice(0, 10) === todayIso) || null,
    [liveLogs, todayIso],
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
    n += livePhotos.filter((p) => String(p.taken_date || "").slice(0, 10) === todayIso).length;
    n += livePunchlist.filter((p) => String(p.created_at || "").slice(0, 10) === todayIso).length;
    n += liveInspections.filter((i) => String(i.inspection_date || "").slice(0, 10) === todayIso).length;
    n += liveSafety.filter((s) => String(s.incident_date || "").slice(0, 10) === todayIso).length;
    return n;
  }, [todayLog, livePhotos, livePunchlist, liveInspections, liveSafety, todayIso]);

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
        onClick: () => navigate("/Punchlist"),
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
        onClick: () => navigate("/Inspections"),
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
        onClick: () => navigate("/Safety"),
      });
    }
    items.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return items;
  }, [livePunchlist, liveInspections, liveSafety, navigate]);

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
      days.push({ iso, day: dayOfWeek, count });
    }
    return days;
  }, [liveLogs, livePhotos, livePunchlist, liveInspections]);

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
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      {/* KPI tile-strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
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
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}>
            <SubPanel
              title="Today's Activity"
              icon={ClipboardList}
              cta={projectId ? {
                label: todayLog ? "Open Daily Log" : "+ Log Today",
                onClick: () => navigate(todayLog ? "/DailyLogs" : "/DailyLogs?new=1"),
              } : null}
            >
              {todayLog ? (
                <DailyLogPreview log={todayLog} onClick={() => navigate("/DailyLogs")} />
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
                        onClick={() => navigate("/DailyLogs")}
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
                <EmptyHint text="No open punch, inspections, or safety items." />
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

function SubPanel({ title, icon: IconCmp, count, cta, children }) {
  return (
    <div style={{
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8 }}>
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
          background: "rgba(7,9,14,0.8)",
          color: "white",
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
    <div style={{
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
