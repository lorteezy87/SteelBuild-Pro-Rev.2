/**
 * DashboardControlCenter — light Command UI redesign of the project Dashboard.
 *
 * Rendered via flag_branch in Dashboard.jsx when `command_ui` is enabled.
 * Receives the same prop bundle as ProjectDashboard — zero new data fetches.
 *
 * Structure (mirrors RfiControlCenter pattern):
 *   PageHero    — title, chips (health / RFIs / schedule)
 *   KpiStrip    — 4 KPIs: Open RFIs / Schedule Health / Cost Health / Pending Submittals
 *   cmd-panels  — Critical Alerts · Project Summary · SteelBuild Modules
 *   FilterBar   — search + filter bar for the activity table
 *   DataTable   — Recent Activity rows
 *
 * The module tile grid is lifted from ProjectDashboard's model and rendered
 * natively in a cmd-panel so no internal component import is needed — this
 * keeps the CC self-contained while showing identical tile data.
 */

import { useMemo, useState } from "react";
import { LayoutDashboard, FileText, HelpCircle, CalendarDays, DollarSign } from "lucide-react";
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
import type { Column, KpiCellDef } from "@/components/command";
import { buildDashboardSummary } from "./dashboardControlCenter.derive";
import type { DashActivityRow, ModuleTile } from "./dashboardControlCenter.derive";
import { getPageIcon } from "@/config/pageIcons";

// ── Prop type matches what Dashboard.jsx already passes to ProjectDashboard ───

interface DashboardControlCenterProps {
  project?: Record<string, unknown> | null;
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
  /** Navigation handler — same signature as in ProjectDashboard */
  onNavigate?: (target: string, opts?: Record<string, unknown>) => void;
}

// ── Tone mapping helpers ──────────────────────────────────────────────────────

type PillTone = "neutral" | "good" | "warn" | "danger" | "info";

function activityTone(tone: string): PillTone {
  if (tone === "approved") return "good";
  if (tone === "waiting") return "warn";
  if (tone === "open") return "danger";
  if (tone === "progress") return "info";
  return "neutral";
}

function alertPriorityTone(priority: "high" | "medium" | "low"): PillTone {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warn";
  return "neutral";
}

// ── Module Tile grid ──────────────────────────────────────────────────────────

function ModuleTileGrid({ modules, onNavigate }: {
  modules: ModuleTile[];
  onNavigate?: (target: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 10,
        padding: "4px 0",
      }}
    >
      {modules.map((module) => {
        const Icon = getPageIcon(module.page);
        return (
          <button
            key={module.page}
            type="button"
            onClick={() => onNavigate?.(module.target)}
            aria-label={`Open ${module.title}`}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              minHeight: 100,
              borderRadius: 8,
              border: "1.5px solid var(--cmd-border, #e5e7eb)",
              background: "var(--cmd-surface, #fff)",
              overflow: "hidden",
              cursor: "pointer",
              padding: "10px 12px 10px",
              textAlign: "left",
              transition: "box-shadow 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--cmd-accent, #F2A706)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--cmd-border, #e5e7eb)";
            }}
          >
            {/* Background photo (faded) */}
            <img
              src={module.photo}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.10,
                pointerEvents: "none",
              }}
            />
            {/* Icon */}
            <span style={{ marginBottom: 6, color: "var(--cmd-accent, #F2A706)" }}>
              <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            {/* Labels */}
            <strong
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--cmd-text-primary, #111)",
                lineHeight: 1.2,
                marginBottom: 2,
              }}
            >
              {module.title}
            </strong>
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: module.tone === "good"
                  ? "var(--cmd-tone-good, #16a34a)"
                  : "var(--cmd-text-muted, #6b7280)",
                fontWeight: 500,
              }}
            >
              {module.metric}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardControlCenter(props: DashboardControlCenterProps) {
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
    onNavigate,
  } = props;

  useCommandSkin();

  const [search, setSearch] = useState("");

  const s = useMemo(
    () =>
      buildDashboardSummary({
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
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      project, rfis, cos, codes, wps, deliveries, actionItems,
      expenses, submittals, drawings, sovItems, scheduleTasks,
      drawingActivity, punchlistItems, inspections, safetyIncidents, qualityRecords,
    ],
  );

  // Hero chips
  const chips = [
    { label: `Health: ${s.healthLabel}`, tone: s.healthScore >= 85 ? ("good" as const) : s.healthScore >= 70 ? ("warn" as const) : ("danger" as const) },
    { label: `${s.openRfis} Open RFIs` },
    { label: `${s.schedulePct}% Complete` },
  ];

  // Hero stat cards
  const heroStats = [
    { value: `${s.healthScore}%`, label: "Project Health" },
    { value: `${s.schedulePct}%`, label: "Schedule" },
  ];

  // KPI strip
  const kpiCells: KpiCellDef[] = [
    { label: s.kpis[0].label, value: s.kpis[0].value, sublabel: s.kpis[0].sublabel, tone: s.kpis[0].tone, Icon: HelpCircle },
    { label: s.kpis[1].label, value: s.kpis[1].value, sublabel: s.kpis[1].sublabel, tone: s.kpis[1].tone, Icon: CalendarDays },
    { label: s.kpis[2].label, value: s.kpis[2].value, sublabel: s.kpis[2].sublabel, tone: s.kpis[2].tone, Icon: DollarSign },
    { label: s.kpis[3].label, value: s.kpis[3].value, sublabel: s.kpis[3].sublabel, tone: s.kpis[3].tone, Icon: FileText },
  ];

  // Filter activity rows by search
  const filteredActivity = useMemo(() => {
    if (!search.trim()) return s.recentActivity;
    const q = search.toLowerCase();
    return s.recentActivity.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.relatedTo.toLowerCase().includes(q),
    );
  }, [s.recentActivity, search]);

  // Activity table columns
  const activityColumns: Column<DashActivityRow>[] = [
    { key: "code", header: "ID", render: (r) => <span className="cmd-row__num">{r.code}</span> },
    { key: "type", header: "Type", render: (r) => r.type },
    { key: "description", header: "Description", render: (r) => r.description },
    {
      key: "status",
      header: "Status",
      render: (r) => <Pill tone={activityTone(r.statusTone)}>{r.status}</Pill>,
    },
    { key: "relatedTo", header: "Related To", render: (r) => r.relatedTo },
    { key: "updatedBy", header: "Updated By", render: (r) => <span className="cmd-row__meta">{r.updatedBy}</span> },
    { key: "updated", header: "Updated", align: "right" as const, render: (r) => <span className="cmd-row__meta">{r.updated}</span> },
  ];

  return (
    <div className="dash-cc" data-skin="command">
      <PageHero
        Icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Project overview and quick access to all SteelBuild Pro modules"
        projectName={s.projectName}
        chips={chips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Critical Alerts */}
        <DecisionPanel title="Critical Alerts">
          {s.alerts.length === 0 ? (
            <div className="cmd-row__meta" style={{ padding: "8px 0" }}>No active alerts.</div>
          ) : (
            s.alerts.map((item) => (
              <div className="cmd-row" key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div
                    style={{
                      display: "inline-block",
                      minWidth: 28,
                      padding: "1px 7px",
                      borderRadius: 20,
                      background: item.priority === "high" ? "var(--cmd-tone-danger-bg, #fef2f2)" : "var(--cmd-tone-warn-bg, #fffbeb)",
                      color: item.priority === "high" ? "var(--cmd-tone-danger, #dc2626)" : "var(--cmd-tone-warn, #d97706)",
                      fontWeight: 700,
                      fontSize: 12,
                      marginRight: 8,
                      textAlign: "center",
                    }}
                  >
                    {item.count}
                  </div>
                  <span style={{ fontSize: 13, color: "var(--cmd-text-primary, #111)" }}>{item.label}</span>
                </div>
                <Pill tone={alertPriorityTone(item.priority)}>{item.priorityLabel}</Pill>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Project Summary */}
        <DecisionPanel title="Project Summary">
          {s.summaryRows.map((row) => (
            <div
              className="cmd-row"
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "5px 0",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--cmd-text-muted, #6b7280)" }}>{row.label}</span>
              <strong style={{ fontSize: 13, color: "var(--cmd-text-primary, #111)", fontVariantNumeric: "tabular-nums" }}>
                {row.value}
              </strong>
            </div>
          ))}
        </DecisionPanel>

        {/* SteelBuild Modules — lifted from buildDashboardModel; same tile data */}
        <DecisionPanel
          title="SteelBuild Modules"
          onViewAll={() => onNavigate?.("rfis")}
        >
          <ModuleTileGrid modules={s.modules} onNavigate={(target) => onNavigate?.(target)} />
        </DecisionPanel>
      </div>

      {/* Recent Activity — filterable DataTable */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search activity by type, description, or status"
        filters={
          <>
            <button
              type="button"
              className="cmd-chip-btn is-active"
            >
              All Activity
            </button>
            <button
              type="button"
              className="cmd-chip-btn"
              onClick={() => onNavigate?.("rfis")}
            >
              RFIs
            </button>
            <button
              type="button"
              className="cmd-chip-btn"
              onClick={() => onNavigate?.("submittals")}
            >
              Submittals
            </button>
          </>
        }
      />

      <DataTable
        columns={activityColumns}
        rows={filteredActivity}
        emptyMessage="No recent activity yet."
      />
    </div>
  );
}
