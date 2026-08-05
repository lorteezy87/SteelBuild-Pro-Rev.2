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
 *
 * Pure derive → field/fieldPageHelpers.ts; presentational UI → field/FieldUi.tsx
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
  ListChecks,
} from "lucide-react";
import { localToday } from "@/utils/dates";
import {
  startOfWeekISO,
  startOfMonthISO,
  startOfYearISO,
  filterLiveRecords,
  findTodayLog,
  countPhotosOnDate,
  countPhotosSince,
  countOpenPunch,
  countOpenInspections,
  countSafetyYtd,
  countQcSince,
  countOpenSafety,
  countTodayActivity,
  buildActionFeed,
  buildWeekDays,
  selectRecentLogs,
  selectRecentPhotos,
  buildFieldTiles,
  buildFieldFastActions,
} from "./field/fieldPageHelpers";
import {
  FieldFastCaptureRail,
  TodayExecutionStrip,
  SubPanel,
  SectionLabel,
  EmptyHint,
  DailyLogPreview,
  LogFeedRow,
  ActionRow,
  PhotoThumb,
  WeekActivityStrip,
} from "./field/FieldUi";

const today = localToday;

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
  const liveLogs        = useMemo(() => filterLiveRecords(logs), [logs]);
  const livePhotos      = useMemo(() => filterLiveRecords(photos), [photos]);
  const livePunchlist   = useMemo(() => filterLiveRecords(punchlist), [punchlist]);
  const liveInspections = useMemo(() => filterLiveRecords(inspections), [inspections]);
  const liveSafety      = useMemo(() => filterLiveRecords(safety), [safety]);
  const liveQC          = useMemo(() => filterLiveRecords(qc), [qc]);
  const liveDeliveries  = useMemo(() => filterLiveRecords(deliveries), [deliveries]);

  const deliveryMetrics = useMemo(
    () => buildDeliveryMetrics(liveDeliveries, []),
    [liveDeliveries],
  );

  const todayLog = useMemo(
    () => findTodayLog(liveLogs, todayIso),
    [liveLogs, todayIso],
  );

  const photosToday = useMemo(
    () => countPhotosOnDate(livePhotos, todayIso),
    [livePhotos, todayIso],
  );

  const photosThisWeek = useMemo(
    () => countPhotosSince(livePhotos, weekStart),
    [livePhotos, weekStart],
  );

  const openPunch = useMemo(
    () => countOpenPunch(livePunchlist),
    [livePunchlist],
  );

  const openInspections = useMemo(
    () => countOpenInspections(liveInspections),
    [liveInspections],
  );

  const safetyYTD = useMemo(
    () => countSafetyYtd(liveSafety, yearStart),
    [liveSafety, yearStart],
  );

  const qcThisMonth = useMemo(
    () => countQcSince(liveQC, monthStart),
    [liveQC, monthStart],
  );

  // Today's-activity headline count
  const todayActivityCount = useMemo(
    () =>
      countTodayActivity({
        todayLog,
        photosToday,
        livePunchlist,
        liveInspections,
        liveSafety,
        todayIso,
        deliveryDueTodayCount: deliveryMetrics.dueToday.length,
      }),
    [todayLog, photosToday, livePunchlist, liveInspections, liveSafety, todayIso, deliveryMetrics.dueToday.length],
  );

  // ── Action Items feed (open punch / open inspections / unresolved safety) ──
  const actionFeed = useMemo(() => {
    const items = buildActionFeed({
      livePunchlist,
      liveInspections,
      liveSafety,
      deliveryExceptions: deliveryMetrics.exceptions,
    });
    return items.map((item) => ({
      ...item,
      onClick: () => navigate(item.path),
    }));
  }, [livePunchlist, liveInspections, liveSafety, deliveryMetrics.exceptions, navigate]);

  // 7-day activity bars (events per day) for the mini chart in this week section
  const weekDays = useMemo(
    () =>
      buildWeekDays({
        liveLogs,
        livePhotos,
        livePunchlist,
        liveInspections,
        liveDeliveries,
      }),
    [liveLogs, livePhotos, livePunchlist, liveInspections, liveDeliveries],
  );

  const recentLogs = useMemo(
    () => selectRecentLogs(liveLogs, 4),
    [liveLogs],
  );

  const recentPhotos = useMemo(() => selectRecentPhotos(livePhotos, 12), [livePhotos]);

  const safetyOpen = useMemo(() => countOpenSafety(liveSafety), [liveSafety]);

  const fieldIconMap = {
    clipboard: ClipboardList,
    camera: Camera,
    check: CheckSquare,
    shield: ShieldCheck,
    alert: AlertTriangle,
    testTube: TestTube2,
    truck: Truck,
  };

  const tiles = buildFieldTiles({
    todayLog,
    photosThisWeek,
    openPunch,
    openInspections,
    safetyYTD,
    qcThisMonth,
    loadsToday: deliveryMetrics.dueToday.length,
    overdueLoads: deliveryMetrics.overdue.length,
    openLoads: deliveryMetrics.openCount,
  }).map((tile) => ({
    ...tile,
    icon: fieldIconMap[tile.iconKey],
    onClick: () => navigate(tile.path),
  }));

  const fastActions = buildFieldFastActions({
    todayLog,
    photosToday,
    openPunch,
    safetyYTD,
    loadsToday: deliveryMetrics.dueToday.length,
    overdueLoads: deliveryMetrics.overdue.length,
  }).map((action) => ({
    ...action,
    icon: fieldIconMap[action.iconKey],
    onClick: () => navigate(action.path),
  }));

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
        safetyOpen={safetyOpen}
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
