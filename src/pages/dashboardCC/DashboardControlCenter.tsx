/**
 * DashboardControlCenter — light Command UI redesign of the project Dashboard.
 *
 * Rendered unconditionally by Dashboard.jsx for the project-scoped view.
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
import "@/styles/piece-control-command.css";
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
import { photoFor } from "@/config/launcherConfig";
import { buildDashboardSummary } from "./dashboardControlCenter.derive";
import type { DashActivityRow, ModuleTile } from "./dashboardControlCenter.derive";
import { getPageIcon } from "@/config/pageIcons";
import { PieceControlDashboardPanel } from "@/components/pieceControl/PieceControlDashboardPanel";

// ── Prop type matches what Dashboard.jsx already passes to ProjectDashboard ───

interface DashboardControlCenterProps {
  project?: (Record<string, unknown> & {
    id: string;
    piece_control_mode?: string | null;
  }) | null;
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

// Restored photographic launcher tile: the complete SteelBuild photo (icon +
// title baked in) is the FULL tile face — vivid, not a 10%-opacity wash — with
// the live KPI metric in a small badge (top-right, clear of the baked-in label).
// Falls back to a dark gradient + icon + title when a photo is missing.
function DashModuleTile({ module, onNavigate }: {
  module: ModuleTile;
  onNavigate?: (target: string) => void;
}) {
  const Icon = getPageIcon(module.page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!module.photo && !imgFailed;
  const metricColor =
    module.tone === "good" ? "#86efac" : module.tone === "danger" ? "#fca5a5" : "#f4f7fa";
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(module.target)}
      aria-label={`Open ${module.title} — ${module.metric}`}
      className="dash-module-tile"
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        padding: 0,
        color: "#fff",
        background: "linear-gradient(150deg, #2a3548 0%, #141c26 55%, #0a0e15 100%)",
        boxShadow: "0 6px 16px rgba(0,0,0,0.40)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 12px 28px rgba(0,0,0,0.50)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = "";
        el.style.boxShadow = "0 6px 16px rgba(0,0,0,0.40)";
      }}
    >
      {showPhoto ? (
        <img
          src={module.photo}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 12 }}>
          <Icon size={34} strokeWidth={1.5} color="#fff" aria-hidden="true" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.7))" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center", lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>{module.title}</span>
        </span>
      )}
      {/* Live KPI metric badge — top-right, clear of the baked-in label + icon */}
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          maxWidth: "82%",
          padding: "3px 9px",
          borderRadius: 8,
          background: "rgba(8,12,18,0.74)",
          fontSize: 11.5,
          fontWeight: 700,
          color: metricColor,
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {module.metric}
      </span>
    </button>
  );
}

function ModuleTileGrid({ modules, onNavigate }: {
  modules: ModuleTile[];
  onNavigate?: (target: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
        gap: 14,
        padding: "4px 0",
      }}
    >
      {modules.map((module) => (
        <DashModuleTile key={module.page} module={module} onNavigate={onNavigate} />
      ))}
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
        photoSrc={photoFor("Dashboard") ?? undefined}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      {project ? (
        <PieceControlDashboardPanel
          project={project}
          onOpen={() => onNavigate?.("piece-register")}
        />
      ) : null}

      {/* SteelBuild Modules — photographic launcher, restored + front-and-center */}
      <DecisionPanel title="SteelBuild Modules" onViewAll={() => onNavigate?.("rfis")}>
        <ModuleTileGrid modules={s.modules} onNavigate={(target) => onNavigate?.(target)} />
      </DecisionPanel>

      <div className="cmd-panels" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
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
