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
import { OperationalSummary, PageHeader, useCommandSkin } from "@/components/command";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { buildDeliveryMetrics } from "./deliveries/analytics";
import {
  AlertTriangle,
  Camera,
  CheckSquare,
  ClipboardList,
  Plus,
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
  useCommandSkin();
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

  const operationalMetrics = [
    {
      label: "Daily Log",
      value: isLoading ? "Unknown" : summary.todayLog ? "Recorded" : "Missing",
      sublabel: isLoading
        ? "checking today"
        : summary.todayLog
          ? "today's field record"
          : "no log found today",
      tone: isLoading ? "neutral" : summary.todayLog ? "good" : "warn",
    },
    {
      label: "Crew",
      value: isLoading
        ? "Unknown"
        : summary.todayLog
          ? (summary.todayLog.headcount ?? "Unknown")
          : "Unknown",
      sublabel: summary.todayLog ? "today" : "daily log required",
      tone: "neutral",
    },
    {
      label: "Hours",
      value: isLoading
        ? "Unknown"
        : summary.todayLog
          ? (summary.todayLog.hours_worked ?? "Unknown")
          : "Unknown",
      sublabel: summary.todayLog ? "today" : "daily log required",
      tone: "neutral",
    },
    {
      label: "Loads Today",
      value: isLoading ? "Unknown" : deliveryMetrics.dueToday.length,
      sublabel: isLoading ? "checking deliveries" : `${deliveryMetrics.openCount} open`,
      tone: !isLoading && deliveryMetrics.overdue.length > 0 ? "danger" : "info",
    },
    {
      label: "Late Loads",
      value: isLoading ? "Unknown" : deliveryMetrics.overdue.length,
      sublabel: "delivery exceptions",
      tone: !isLoading && deliveryMetrics.overdue.length > 0 ? "danger" : "good",
    },
    {
      label: "Open Punch",
      value: isLoading ? "Unknown" : summary.openPunch,
      sublabel: "field closeout",
      tone: !isLoading && summary.openPunch > 0 ? "warn" : "good",
    },
    {
      label: "Open Inspections",
      value: isLoading ? "Unknown" : summary.openInspections,
      sublabel: "field checks",
      tone: !isLoading && summary.openInspections > 0 ? "info" : "neutral",
    },
    {
      label: "Open Safety",
      value: isLoading ? "Unknown" : summary.openSafety,
      sublabel: "active items",
      tone: !isLoading && summary.openSafety > 0 ? "danger" : "good",
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
      <PageHeader
        eyebrow={activeProject ? `${activeProject.name} / Field` : "All Projects / Field"}
        title="Field Today"
        subtitle={
          isLoading
            ? "Loading today's field execution record."
            : summary.todayLog
              ? `${summary.todayLog.headcount ?? "Unknown"} crew · ${summary.todayLog.hours_worked ?? "Unknown"} hrs · ${summary.photosToday} photos today`
              : "Today's daily log has not been recorded. Crew and hours remain unknown until it is."
        }
        meta={isLoading ? "Today's activity: unknown" : `${summary.todayActivityCount} field events today`}
        actions={
          projectId ? (
            <button
              type="button"
              className={summary.todayLog ? "cmd-btn cmd-btn--ghost" : "cmd-btn cmd-btn--primary"}
              onClick={actions.openTodayLog}
              disabled={isLoading}
            >
              <Plus size={12} />
              {summary.todayLog ? "Open Today's Log" : "Log Today"}
            </button>
          ) : null
        }
      />

      <OperationalSummary
        metrics={operationalMetrics}
        ariaLabel="Today's field execution summary"
      />

      <FieldFastCaptureRail actions={fastActions} />

      <TodayExecutionStrip
        todayLog={summary.todayLog}
        photosToday={summary.photosToday}
        openPunch={summary.openPunch}
        safetyOpen={summary.openSafety}
        deliveryDueToday={deliveryMetrics.dueToday.length}
        deliveryLate={deliveryMetrics.overdue.length}
      />

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
