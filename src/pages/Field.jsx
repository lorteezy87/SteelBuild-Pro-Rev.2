/**
 * Field.jsx — read-only field operations overview.
 *
 * Queries stay here so project scoping and cache keys remain visible at the
 * route boundary. Typed status/date/count derivations live in
 * field/fieldDashboardDerive.ts; presentational sections and route navigation
 * are isolated beside it. FieldToday continues to own all offline mutations.
 */

import React, { useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { CommandBar, KpiTile } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { buildDeliveryMetrics } from "./deliveries/analytics";
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  ClipboardList,
  Plus,
  ShieldCheck,
  TestTube2,
  Truck,
} from "lucide-react";
import { localToday } from "@/utils/dates";
import {
  buildFieldDashboardDateContext,
  buildFieldDashboardSummary,
} from "./field/fieldDashboardDerive";
import {
  FieldDashboardContent,
  FieldFastCaptureRail,
  TodayExecutionStrip,
  WeekActivityStrip,
} from "./field/FieldDashboardSections";
import { useFieldDashboardNavigation } from "./field/useFieldDashboardNavigation";

export default function Field() {
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const filterArgs = projectId ? { project_id: projectId } : null;

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["field-hub-daily-logs", projectId],
    queryFn: () =>
      filterArgs
        ? entities.DailyLog.filter(filterArgs, "-date")
        : entities.DailyLog.list("-date"),
    staleTime: 30 * 1000,
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ["field-hub-photos", projectId],
    queryFn: () =>
      filterArgs
        ? entities.Photo.filter(filterArgs, "-taken_date")
        : entities.Photo.list("-taken_date"),
    staleTime: 30 * 1000,
  });

  const { data: punchlist = [], isLoading: punchlistLoading } = useQuery({
    queryKey: ["field-hub-punchlist", projectId],
    queryFn: () =>
      filterArgs
        ? entities.PunchlistItem.filter(filterArgs)
        : entities.PunchlistItem.list(),
    staleTime: 30 * 1000,
  });

  const { data: inspections = [], isLoading: inspectionsLoading } = useQuery({
    queryKey: ["field-hub-inspections", projectId],
    queryFn: () =>
      filterArgs
        ? entities.Inspection.filter(filterArgs, "-inspection_date")
        : entities.Inspection.list("-inspection_date"),
    staleTime: 30 * 1000,
  });

  const { data: safety = [], isLoading: safetyLoading } = useQuery({
    queryKey: ["field-hub-safety", projectId],
    queryFn: () =>
      filterArgs
        ? entities.SafetyIncident.filter(filterArgs, "-incident_date")
        : entities.SafetyIncident.list("-incident_date"),
    staleTime: 30 * 1000,
  });

  const { data: qualityControl = [], isLoading: qualityControlLoading } =
    useQuery({
      queryKey: ["field-hub-qc", projectId],
      queryFn: () =>
        filterArgs
          ? entities.QualityControlRecord.filter(filterArgs, "-test_date")
          : entities.QualityControlRecord.list("-test_date"),
      staleTime: 30 * 1000,
    });

  const { data: deliveries = [], isLoading: deliveriesLoading } = useQuery({
    queryKey: ["field-hub-deliveries", projectId],
    queryFn: () =>
      filterArgs
        ? entities.Delivery.filter(filterArgs, "-scheduled_date")
        : entities.Delivery.list("-scheduled_date"),
    staleTime: 30 * 1000,
  });

  const isLoading =
    logsLoading ||
    photosLoading ||
    punchlistLoading ||
    inspectionsLoading ||
    safetyLoading ||
    qualityControlLoading ||
    deliveriesLoading;

  const deliveryMetrics = useMemo(
    () => buildDeliveryMetrics(deliveries, []),
    [deliveries],
  );
  const todayIso = localToday();
  const dateContext = useMemo(
    () => buildFieldDashboardDateContext(new Date(), todayIso),
    [todayIso],
  );
  const summary = useMemo(
    () =>
      buildFieldDashboardSummary(
        {
          logs,
          photos,
          punchlist,
          inspections,
          safety,
          qualityControl,
          deliveries,
        },
        deliveryMetrics,
        dateContext,
      ),
    [
      logs,
      photos,
      punchlist,
      inspections,
      safety,
      qualityControl,
      deliveries,
      deliveryMetrics,
      dateContext,
    ],
  );
  const actions = useFieldDashboardNavigation(summary.todayLog?.id);

  const tiles = [
    {
      key: "log-today",
      label: "Daily Log Today",
      value: summary.todayLog ? "✓" : "—",
      color: summary.todayLog
        ? "var(--status-success-bright)"
        : "var(--text-muted)",
      icon: ClipboardList,
      onClick: actions.openDailyLogSummary,
      sub: summary.todayLog
        ? `${summary.todayLog.headcount || 0} crew`
        : "log not started",
    },
    {
      key: "photos-week",
      label: "Photos · Week",
      value: summary.photosThisWeek,
      color: "var(--accent)",
      icon: Camera,
      onClick: actions.openPhotos,
    },
    {
      key: "open-punch",
      label: "Open Punch",
      value: summary.openPunch,
      color:
        summary.openPunch > 0
          ? "var(--status-warning-bright)"
          : "var(--status-success-bright)",
      icon: CheckSquare,
      onClick: actions.openPunchlist,
    },
    {
      key: "open-insp",
      label: "Open Inspections",
      value: summary.openInspections,
      color:
        summary.openInspections > 0
          ? "var(--status-info)"
          : "var(--text-muted)",
      icon: ShieldCheck,
      onClick: actions.openInspections,
    },
    {
      key: "safety-ytd",
      label: "Safety · YTD",
      value: summary.safetyYtd,
      color:
        summary.safetyYtd > 0
          ? "var(--status-error-bright)"
          : "var(--status-success-bright)",
      icon: AlertTriangle,
      onClick: actions.openSafety,
    },
    {
      key: "qc-month",
      label: "QC · Month",
      value: summary.qualityControlThisMonth,
      color: "var(--phase-fabrication)",
      icon: TestTube2,
      onClick: actions.openQualityControl,
    },
    {
      key: "delivery-today",
      label: "Loads Today",
      value: deliveryMetrics.dueToday.length,
      color:
        deliveryMetrics.overdue.length > 0
          ? "var(--status-error-bright)"
          : "var(--phase-delivery)",
      icon: Truck,
      onClick: actions.receiveDelivery,
      sub:
        deliveryMetrics.overdue.length > 0
          ? `${deliveryMetrics.overdue.length} late`
          : `${deliveryMetrics.openCount} open`,
    },
  ];

  const fastActions = [
    {
      key: "daily-log",
      label: summary.todayLog ? "Open Log" : "Log Today",
      sub: summary.todayLog
        ? `${summary.todayLog.headcount || 0} crew recorded`
        : "Crew, hours, weather",
      icon: ClipboardList,
      color: summary.todayLog
        ? "var(--status-success-bright)"
        : "var(--accent)",
      onClick: actions.openDailyLogSummary,
    },
    {
      key: "photo",
      label: "Add Photo",
      sub: summary.photosToday
        ? `${summary.photosToday} today`
        : "Progress or issue",
      icon: Camera,
      color: "var(--accent)",
      onClick: actions.addPhoto,
    },
    {
      key: "punch",
      label: "Punch Item",
      sub: summary.openPunch
        ? `${summary.openPunch} open`
        : "Create close-out item",
      icon: CheckSquare,
      color: summary.openPunch
        ? "var(--status-warning-bright)"
        : "var(--status-success-bright)",
      onClick: actions.addPunch,
    },
    {
      key: "safety",
      label: "Safety",
      sub: summary.safetyYtd
        ? `${summary.safetyYtd} YTD`
        : "Hazard or incident",
      icon: AlertTriangle,
      color: summary.safetyYtd
        ? "var(--status-error-bright)"
        : "var(--status-success-bright)",
      onClick: actions.addSafety,
    },
    {
      key: "delivery",
      label: "Delivery",
      sub: deliveryMetrics.overdue.length
        ? `${deliveryMetrics.overdue.length} late`
        : `${deliveryMetrics.dueToday.length} due today`,
      icon: Truck,
      color: deliveryMetrics.overdue.length
        ? "var(--status-error-bright)"
        : "var(--phase-delivery)",
      onClick: actions.receiveDelivery,
    },
  ];

  return (
    <div
      className="sb-dashboard-reference-page field-mobile-console"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CommandBar
        eyebrow={activeProject ? activeProject.name : "ALL PROJECTS"}
        title="Field"
        count={summary.todayActivityCount}
        unit=" · TODAY"
        subtitle={
          summary.todayLog
            ? `${summary.todayLog.headcount || 0} crew · ${
                summary.todayLog.hours_worked || 0
              } hrs · ${summary.recentPhotos.length} recent photos`
            : "No log today — log first to start tracking man-hours"
        }
      >
        {!summary.todayLog && projectId && (
          <button
            type="button"
            onClick={actions.openTodayLog}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
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
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "var(--accent)";
            }}
          >
            <Plus size={12} /> Log Today
          </button>
        )}
      </CommandBar>

      <FieldFastCaptureRail actions={fastActions} />

      <TodayExecutionStrip
        todayLog={summary.todayLog}
        photosToday={summary.photosToday}
        openPunch={summary.openPunch}
        safetyOpen={summary.openSafety}
        deliveryDueToday={deliveryMetrics.dueToday.length}
        deliveryLate={deliveryMetrics.overdue.length}
      />

      <div
        className="field-kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {tiles.map((tile) => (
          <KpiTile
            key={tile.key}
            compact
            label={tile.label}
            value={tile.value}
            sub={tile.sub}
            color={tile.color}
            onClick={tile.onClick}
          />
        ))}
      </div>

      <WeekActivityStrip days={summary.weekDays} />

      {isLoading ? (
        <LoadingSkeleton variant="page" />
      ) : (
        <FieldDashboardContent
          projectSelected={!!projectId}
          todayLog={summary.todayLog}
          recentLogs={summary.recentLogs}
          recentPhotos={summary.recentPhotos}
          totalPhotos={summary.livePhotos.length}
          actionFeed={summary.actionFeed}
          onOpenTodayLog={actions.openTodayLog}
          onOpenLog={(id) => actions.openHref(`/DailyLogs?id=${id}`)}
          onOpenPhotos={actions.openPhotos}
          onOpenHref={actions.openHref}
        />
      )}
    </div>
  );
}
