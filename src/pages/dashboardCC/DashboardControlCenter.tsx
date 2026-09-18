import { useMemo } from "react";
import "@/styles/command.css";
import "@/styles/piece-control-command.css";
import {
  AttentionQueue,
  DataTable,
  OperationalSummary,
  PageHeader,
  Pill,
  QuickAccess,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column, OperationalMetric, QuickAccessItem } from "@/components/command";
import { PieceControlDashboardPanel } from "@/components/pieceControl/PieceControlDashboardPanel";
import { getPageIcon } from "@/config/pageIcons";
import { buildDashboardSummary } from "./dashboardControlCenter.derive";
import type { DashActivityRow } from "./dashboardControlCenter.derive";
import { buildDashboardReferenceModel } from "./dashboardReference.derive";

interface DashboardControlCenterProps {
  project?: (Record<string, unknown> & { id: string; piece_control_mode?: string | null }) | null;
  rfis?: Record<string, unknown>[];
  cos?: Record<string, unknown>[];
  codes?: Record<string, unknown>[];
  wps?: Record<string, unknown>[];
  deliveries?: Record<string, unknown>[];
  actionItems?: Record<string, unknown>[];
  expenses?: Record<string, unknown>[];
  submittals?: Record<string, unknown>[];
  drawings?: Record<string, unknown>[];
  sovItems?: Record<string, unknown>[];
  scheduleTasks?: Record<string, unknown>[];
  drawingActivity?: Record<string, unknown>[];
  punchlistItems?: Record<string, unknown>[];
  inspections?: Record<string, unknown>[];
  safetyIncidents?: Record<string, unknown>[];
  qualityRecords?: Record<string, unknown>[];
  todayIso?: string;
  rfiEvidenceLoaded?: boolean;
  scheduleEvidenceLoaded?: boolean;
  onNavigate?: (target: string, opts?: Record<string, unknown>) => void;
}

function toneForStatus(statusTone: string) {
  if (statusTone === "approved") return "good" as const;
  if (statusTone === "waiting") return "warn" as const;
  if (statusTone === "open") return "danger" as const;
  if (statusTone === "progress") return "info" as const;
  return "neutral" as const;
}

export default function DashboardControlCenter(props: DashboardControlCenterProps) {
  useCommandSkin();

  const {
    project,
    rfis = [],
    cos = [],
    codes = [],
    wps = [],
    deliveries = [],
    actionItems = [],
    expenses = [],
    submittals = [],
    drawings = [],
    sovItems = [],
    scheduleTasks = [],
    drawingActivity = [],
    punchlistItems = [],
    inspections = [],
    safetyIncidents = [],
    qualityRecords = [],
    todayIso,
    rfiEvidenceLoaded = true,
    scheduleEvidenceLoaded = true,
    onNavigate,
  } = props;

  const summary = useMemo(
    () => buildDashboardSummary({
      project,
      rfis,
      cos,
      codes,
      wps,
      deliveries,
      actionItems,
      expenses,
      submittals,
      drawings,
      sovItems,
      scheduleTasks,
      drawingActivity,
      punchlistItems,
      inspections,
      safetyIncidents,
      qualityRecords,
      todayIso,
      rfiEvidenceLoaded,
      scheduleEvidenceLoaded,
    }),
    [
      project, rfis, cos, codes, wps, deliveries, actionItems, expenses,
      submittals, drawings, sovItems, scheduleTasks, drawingActivity,
      punchlistItems, inspections, safetyIncidents, qualityRecords, todayIso,
      rfiEvidenceLoaded, scheduleEvidenceLoaded,
    ],
  );

  const effectiveToday = todayIso ?? new Date().toISOString().slice(0, 10);
  const reference = useMemo(
    () => buildDashboardReferenceModel({
      summary,
      todayIso: effectiveToday,
      rfis,
      submittals,
      workPackages: wps,
      deliveries,
      changeOrders: cos,
    }),
    [summary, effectiveToday, rfis, submittals, wps, deliveries, cos],
  );

  const metrics: OperationalMetric[] = [
    {
      label: "Project Health",
      value: `${summary.healthScore}%`,
      sublabel: summary.healthLabel,
      tone: summary.healthLabel === "On Track" ? "good" : summary.healthLabel === "At Risk" ? "danger" : "warn",
    },
    ...summary.kpis.map((kpi) => ({
      label: kpi.label,
      value: kpi.value,
      sublabel: kpi.sublabel,
      tone: kpi.tone,
    })),
  ];

  const attention: AttentionItem[] = reference.attention.map((item) => ({
    ...item,
    onOpen: item.target ? () => onNavigate?.(item.target!) : undefined,
  }));

  const quickAccess: QuickAccessItem[] = summary.modules.slice(0, 6).map((module) => ({
    page: module.target,
    label: module.title,
    metric: module.metric,
    Icon: getPageIcon(module.page),
  }));

  const activityColumns: Column<DashActivityRow>[] = [
    { key: "code", header: "ID", render: (row) => <span className="cmd-row__num">{row.code}</span> },
    { key: "type", header: "Type", render: (row) => row.type },
    { key: "description", header: "Description", render: (row) => row.description },
    {
      key: "status",
      header: "Status",
      render: (row) => <Pill tone={toneForStatus(row.statusTone)}>{row.status}</Pill>,
    },
    { key: "relatedTo", header: "Related To", render: (row) => row.relatedTo },
    { key: "updated", header: "Updated", align: "right", render: (row) => <span className="cmd-row__meta">{row.updated}</span> },
  ];

  return (
    <div className="sbp-command-page dash-cc" data-skin="command">
      <PageHeader
        eyebrow={`${summary.projectName} / Command`}
        title="Project Dashboard"
        subtitle="Project condition, production readiness, and management action in one view."
        meta={summary.healthReasons[0] || undefined}
      />

      <OperationalSummary metrics={metrics} />

      <AttentionQueue items={attention} />

      <section className="sbp-work-grid" aria-label="Operational bands">
        {reference.bands.map((band) => (
          <button
            type="button"
            key={band.id}
            className={`sbp-work-panel sbp-band-panel is-${band.tone}`}
            onClick={() => onNavigate?.(band.target)}
            style={{ cursor: onNavigate ? "pointer" : "default", textAlign: "left", color: "inherit" }}
          >
            <div className="sbp-work-panel__head">
              <h2>{band.label}</h2>
              <Pill tone={band.tone}>{band.metric}</Pill>
            </div>
            <div className="sbp-work-panel__body">
              <div className="cmd-row__meta">{band.detail}</div>
            </div>
          </button>
        ))}
      </section>

      {project ? (
        <PieceControlDashboardPanel
          project={project}
          onOpen={() => onNavigate?.("piece-register")}
        />
      ) : null}

      {quickAccess.length ? <QuickAccess items={quickAccess} onSelect={(target) => onNavigate?.(target)} /> : null}

      <section className="sbp-work-panel" aria-label="Recent activity">
        <div className="sbp-work-panel__head"><h2>Recent Activity</h2></div>
        <DataTable
          columns={activityColumns}
          rows={summary.recentActivity.slice(0, 12)}
          emptyMessage="No recent project activity."
        />
      </section>
    </div>
  );
}
