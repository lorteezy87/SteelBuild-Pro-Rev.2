import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, CircleDollarSign, Factory, FileCheck2, HardHat } from "lucide-react";
import { todayLocalISO } from "@/lib/dateMath";
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
import "@/styles/dashboard-executive.css";

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

const EMPTY_ROWS: Record<string, unknown>[] = [];

const BAND_ICONS = {
  approvals: FileCheck2,
  production: Factory,
  field: HardHat,
  commercial: CircleDollarSign,
};

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
    rfis = EMPTY_ROWS,
    cos = EMPTY_ROWS,
    codes = EMPTY_ROWS,
    wps = EMPTY_ROWS,
    deliveries = EMPTY_ROWS,
    actionItems = EMPTY_ROWS,
    expenses = EMPTY_ROWS,
    submittals = EMPTY_ROWS,
    drawings = EMPTY_ROWS,
    sovItems = EMPTY_ROWS,
    scheduleTasks = EMPTY_ROWS,
    drawingActivity = EMPTY_ROWS,
    punchlistItems = EMPTY_ROWS,
    inspections = EMPTY_ROWS,
    safetyIncidents = EMPTY_ROWS,
    qualityRecords = EMPTY_ROWS,
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

  const effectiveToday = todayIso ?? todayLocalISO();
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
      value: summary.healthLabel,
      sublabel: summary.operationalHealth.partial ? "Partial operating evidence" : "Operational condition",
      tone: summary.healthLabel === "On Track" ? "good"
        : ["At Risk", "On Hold"].includes(summary.healthLabel) ? "danger"
          : summary.healthLabel === "Watch" ? "warn" : "neutral",
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
    onOpen: item.target && onNavigate ? () => onNavigate(item.target!) : undefined,
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

  const attentionTotal = reference.attentionTotal ?? attention.length;
  const reviewDate = new Date(`${effectiveToday}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="sbp-command-page dash-cc dash-executive" data-skin="command">
      <div className="dash-executive__masthead">
        <span>SteelBuild Pro <span aria-hidden="true">/</span> Executive workspace</span>
        <time dateTime={effectiveToday}>{reviewDate}</time>
      </div>

      <PageHeader
        eyebrow={summary.projectName}
        title="Project Dashboard"
        subtitle="Control the work. Protect the margin. Keep steel moving."
        meta={summary.healthReasons[0] || "Detailing, fabrication, logistics, and erection in one operating view."}
        actions={onNavigate ? (
          <>
            <button type="button" className="dash-executive__button dash-executive__button--primary"
              onClick={() => onNavigate("CommandCenter")}>
              Open command center <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="dash-executive__button"
              onClick={() => onNavigate("FieldHub")}>
              Field operations <HardHat size={16} aria-hidden="true" />
            </button>
          </>
        ) : undefined}
      />

      <OperationalSummary metrics={metrics} ariaLabel="Executive operating summary" />

      <section className="dash-executive__operations" aria-label="Steel workflow">
        <div className="dash-executive__section-heading">
          <div>
            <span className="dash-executive__eyebrow">From approval to erection</span>
            <h2>Keep the next operation moving</h2>
          </div>
          <span className="dash-executive__caption">Four views of the work ahead</span>
        </div>
        <div className="dash-executive__bands">
          {reference.bands.map((band, index) => {
            const Icon = BAND_ICONS[band.id];
            return (
              <button type="button" key={band.id}
                className={`dash-executive__band is-${band.tone}`}
                disabled={!onNavigate}
                onClick={() => onNavigate?.(band.target)}>
                <div className="dash-executive__band-top">
                  <span className="dash-executive__band-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="dash-executive__band-step">0{index + 1}</span>
                </div>
                <h3>{band.label}</h3>
                <strong className="dash-executive__band-value">{band.metric}</strong>
                <p>{band.detail}</p>
                <span className="dash-executive__band-link">Open workspace <ArrowUpRight size={15} aria-hidden="true" /></span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="dash-executive__decision-grid">
        <div className="dash-executive__priorities">
          <AttentionQueue items={attention}
            emptyMessage="No management priorities were found in the loaded project records." />
          {attentionTotal > attention.length ? (
            <div className="dash-executive__queue-footer">
              <span>Showing {attention.length} of {attentionTotal} priorities</span>
              {onNavigate ? (
                <button type="button" className="dash-executive__text-button"
                  onClick={() => onNavigate("CommandCenter")}>
                  Open full command center <ArrowRight size={15} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="dash-executive__brief" aria-label="Project brief">
          <div className="dash-executive__section-heading">
            <div>
              <span className="dash-executive__eyebrow">At a glance</span>
              <h2>Project brief</h2>
            </div>
          </div>
          {summary.summaryRows.length ? (
            <dl className="dash-executive__facts">
              {summary.summaryRows.map((row) => (
                <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
          ) : <p className="dash-executive__caption">Project details will appear as records are loaded.</p>}
          {summary.operationalHealth.partial ? (
            <p className="dash-executive__evidence" role="status">
              Operating evidence is incomplete. Open the source workspace to review missing records.
            </p>
          ) : null}
          {onNavigate ? (
            <button type="button" className="dash-executive__text-button"
              onClick={() => onNavigate("JobStatusReport")}>
              Open job status report <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          ) : null}
        </aside>
      </div>

      {project ? (
        <PieceControlDashboardPanel project={project}
          onOpen={() => onNavigate?.("piece-register")} />
      ) : null}

      {quickAccess.length ? (
        <section className="dash-executive__shortcuts" aria-label="Project workspaces">
          <span className="dash-executive__eyebrow">Your workspaces</span>
          <QuickAccess items={quickAccess} onSelect={(target) => onNavigate?.(target)} />
        </section>
      ) : null}

      <section className="sbp-work-panel dash-executive__activity" aria-label="Recent activity">
        <div className="sbp-work-panel__head">
          <h2>Recent Activity</h2>
          <span className="dash-executive__caption">Latest project records</span>
        </div>
        <DataTable columns={activityColumns} rows={summary.recentActivity.slice(0, 12)}
          emptyMessage="No recent project activity." />
      </section>
    </div>
  );
}
