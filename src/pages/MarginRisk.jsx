/**
 * MarginRisk.jsx — Margin-at-Risk analysis page.
 *
 * Deterministic margin exposure scoring across 7 risk signal categories:
 * open RFIs, rejected submittals, labor burn, late procurement,
 * failed inspections, schedule slips, and unsigned change orders.
 *
 * Every dollar figure is explainable — links back to the source entity.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  DollarSign,
  FileWarning,
  Hammer,
  Package,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { OperationsPageShell } from "@/components/operations/OperationsPageShell";
import { calculateMarginRisk } from "@/services/marginRiskEngine";

// ── Styling helpers ─────────────────────────────────────────────────
const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "Space Grotesk, var(--font-display)" };

function formatDollars(value) {
  if (!value && value !== 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

const SEVERITY_COLOR = {
  critical: "var(--status-error)",
  high: "var(--status-warning)",
  medium: "var(--text-muted)",
};

const SEVERITY_BG = {
  critical: "rgba(239,68,68,0.12)",
  high: "rgba(245,158,11,0.10)",
  medium: "rgba(148,163,184,0.08)",
};

const SIGNAL_META = {
  open_rfis:            { icon: FileWarning,  color: "var(--status-warning)" },
  rejected_submittals:  { icon: ShieldAlert,  color: "var(--status-error)" },
  labor_burn:           { icon: Hammer,        color: "var(--phase-fab)" },
  late_procurement:     { icon: Package,       color: "var(--phase-delivery)" },
  failed_inspections:   { icon: AlertTriangle, color: "var(--status-error)" },
  schedule_slips:       { icon: Timer,         color: "var(--status-warning)" },
  unsigned_cos:         { icon: DollarSign,    color: "var(--accent)" },
};

const ENTITY_ROUTES = {
  RFI:          "RFIs",
  Submittal:    "Submittals",
  WorkPackage:  "WorkPackages",
  Delivery:     "Deliveries",
  Inspection:   "Inspections",
  ScheduleTask: "Schedule",
  ChangeOrder:  "ChangeOrders",
};

// ── Empty-project placeholder ───────────────────────────────────────
function NoProject() {
  return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>--</div>
      <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        Select a Project
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
        Margin risk analysis is project-scoped. Choose a project from the top nav.
      </div>
    </div>
  );
}

// ── Signal card ─────────────────────────────────────────────────────
function SignalCard({ signal, active, onClick }) {
  const meta = SIGNAL_META[signal.signal] || { icon: BarChart3, color: "var(--text-muted)" };
  const Icon = meta.icon;
  const hasExposure = signal.totalExposure > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 12,
        border: `1px solid ${active ? "var(--accent)" : "color-mix(in srgb, var(--border-default) 82%, transparent)"}`,
        borderRadius: 8,
        background: active
          ? "color-mix(in srgb, var(--accent-muted) 66%, var(--bg-surface))"
          : "color-mix(in srgb, var(--bg-surface) 94%, var(--text-primary) 6%)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.12s ease",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={12} color={meta.color} />
        <span style={{ ...mono, fontSize: 9, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {signal.label}
        </span>
      </div>
      <span style={{ ...display, fontSize: 22, fontWeight: 850, lineHeight: 1, color: hasExposure ? meta.color : "var(--text-muted)" }}>
        {formatDollars(signal.totalExposure)}
      </span>
      <span style={{ ...mono, fontSize: 9, fontWeight: 750, color: "var(--text-muted)" }}>
        {signal.items.length} item{signal.items.length !== 1 ? "s" : ""} &middot; {signal.risk}
      </span>
    </button>
  );
}

// ── Risk item row ───────────────────────────────────────────────────
function RiskItemRow({ item, onNavigate }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr) auto auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: "1px solid color-mix(in srgb, var(--border-default) 50%, transparent)",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: SEVERITY_COLOR[item.severity] || "var(--text-muted)",
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{
          ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.label}
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
          {item.detail}
        </div>
      </div>
      <div style={{ ...display, fontSize: 14, fontWeight: 850, color: SEVERITY_COLOR[item.severity], whiteSpace: "nowrap" }}>
        {formatDollars(item.exposure)}
      </div>
      {ENTITY_ROUTES[item.entityType] && (
        <button
          type="button"
          onClick={() => onNavigate(item)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 6,
            border: "1px solid var(--border-default)",
            background: "rgba(255,255,255,0.03)",
            color: "var(--accent)", cursor: "pointer",
            ...mono, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em",
          }}
          title={`Go to ${item.entityType}`}
        >
          <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
}

// ── Area / WP breakdown card ─────────────────────────────────────────
function BreakdownSection({ title, groups, maxExposure, nameMap }) {
  const [expanded, setExpanded] = useState(false);
  if (!groups || groups.length === 0) return null;
  const shown = expanded ? groups : groups.slice(0, 5);

  return (
    <div style={{
      border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
      borderRadius: 8,
      background: "color-mix(in srgb, var(--bg-surface) 94%, var(--text-primary) 6%)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 50%, transparent)" }}>
        <span style={{ ...mono, fontSize: 9, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {title}
        </span>
      </div>
      {shown.map((group, i) => {
        const pct = maxExposure > 0 ? (group.exposure / maxExposure) * 100 : 0;
        const label = nameMap ? (nameMap[group.workPackageId] || group.workPackageId || group.area) : group.area;
        return (
          <div key={group.area || group.workPackageId || i} style={{ padding: "8px 12px", borderBottom: i < shown.length - 1 ? "1px solid color-mix(in srgb, var(--border-default) 30%, transparent)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                {label || "Unassigned"}
              </span>
              <span style={{ ...display, fontSize: 13, fontWeight: 850, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                {formatDollars(group.exposure)}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "var(--accent)", width: `${Math.max(pct, 1)}%`, transition: "width 0.3s ease" }} />
            </div>
            <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 3 }}>
              {group.items.length} risk item{group.items.length !== 1 ? "s" : ""}
            </div>
          </div>
        );
      })}
      {groups.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%", padding: "8px 12px", border: "none",
            background: "rgba(255,255,255,0.03)", cursor: "pointer",
            ...mono, fontSize: 9, fontWeight: 850, color: "var(--accent)",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}
        >
          {expanded ? "Show Less" : `Show All ${groups.length}`}
        </button>
      )}
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────────
export default function MarginRisk() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const [activeSignal, setActiveSignal] = useState(null);

  // -- Data loading (same pattern as Constraints.jsx) --
  const { data: sources = {}, isLoading } = useQuery({
    queryKey: ["margin-risk-sources", projectId],
    queryFn: async () => {
      if (!projectId) return {};
      const read = (entity, order) =>
        order
          ? entity.filter({ project_id: projectId }, order).catch(() => [])
          : entity.filter({ project_id: projectId }).catch(() => []);
      const [rfis, submittals, workPackages, deliveries, inspections, scheduleTasks, changeOrders] = await Promise.all([
        read(entities.RFI, "-submitted_date"),
        read(entities.Submittal, "-submitted_date"),
        read(entities.WorkPackage),
        read(entities.Delivery, "-scheduled_date"),
        read(entities.Inspection, "-inspection_date"),
        read(entities.ScheduleTask, "start_date"),
        read(entities.ChangeOrder),
      ]);
      return { rfis, submittals, workPackages, deliveries, inspections, scheduleTasks, changeOrders };
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const risk = useMemo(() => calculateMarginRisk(sources), [sources]);

  // Build WP name map for the breakdown section
  const wpNameMap = useMemo(() => {
    const map = {};
    for (const wp of sources.workPackages || []) {
      const label = [wp.wp_number, wp.name].filter(Boolean).join(" - ");
      map[wp.id] = label || wp.id?.slice(0, 8) || "Unknown";
    }
    map.unlinked = "Unlinked Items";
    return map;
  }, [sources.workPackages]);

  const handleNavigate = (item) => {
    const route = ENTITY_ROUTES[item.entityType];
    if (route) navigate(`/${route}${projectId ? `?projectId=${projectId}` : ""}`);
  };

  // Filter items by active signal
  const displayItems = useMemo(() => {
    if (!activeSignal) return risk.topRisks;
    const signal = risk.signals.find(s => s.signal === activeSignal);
    return signal ? signal.items.sort((a, b) => b.exposure - a.exposure) : risk.topRisks;
  }, [risk, activeSignal]);

  if (!projectId) return <NoProject />;

  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Calculating margin exposure...
        </div>
      </div>
    );
  }

  const maxAreaExposure = risk.byArea.length > 0 ? risk.byArea[0].exposure : 1;
  const maxWpExposure = risk.byWorkPackage.length > 0 ? risk.byWorkPackage[0].exposure : 1;

  return (
    <div className="sb-dashboard-reference-page">
    <OperationsPageShell
      eyebrow={activeProject?.name || "Project"}
      title="Margin at Risk"
      subtitle="Deterministic margin exposure analysis across 7 operational risk signals. Every dollar is traceable to a specific RFI, submittal, delivery, or task."
      meta={[
        { label: "Total Exposure", value: formatDollars(risk.totalExposure), color: risk.totalExposure > 0 ? "var(--status-error)" : "var(--status-success)" },
        { label: "Critical", value: risk.severity.critical, color: risk.severity.critical > 0 ? "var(--status-error)" : "var(--text-muted)" },
        { label: "High", value: risk.severity.high, color: risk.severity.high > 0 ? "var(--status-warning)" : "var(--text-muted)" },
        { label: "Risk Items", value: risk.allItems.length },
      ]}
      metrics={risk.signals.map(s => ({
        key: s.signal,
        label: s.label,
        value: formatDollars(s.totalExposure),
        sub: `${s.items.length} items`,
        color: s.totalExposure > 0 ? (SIGNAL_META[s.signal]?.color || "var(--text-muted)") : "var(--text-muted)",
        active: activeSignal === s.signal,
        onClick: () => setActiveSignal(activeSignal === s.signal ? null : s.signal),
      }))}
    >
      {/* ── Hero exposure number ── */}
      {risk.totalExposure > 0 && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: "24px 16px",
          border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
          borderRadius: 8,
          background: "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(245,158,11,0.04), transparent)",
        }}>
          <span style={{ ...mono, fontSize: 9, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
            ESTIMATED MARGIN EXPOSURE
          </span>
          <span style={{ ...display, fontSize: 48, fontWeight: 900, lineHeight: 1, color: "var(--status-error)" }}>
            {formatDollars(risk.totalExposure)}
          </span>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              <span style={{ color: SEVERITY_COLOR.critical }}>{risk.severity.critical}</span> critical
            </span>
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              <span style={{ color: SEVERITY_COLOR.high }}>{risk.severity.high}</span> high
            </span>
            <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              {risk.severity.medium} medium
            </span>
          </div>
        </div>
      )}

      {/* ── No risk fallback ── */}
      {risk.allItems.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 24px",
          border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
          borderRadius: 8,
          background: "color-mix(in srgb, var(--bg-surface) 94%, var(--text-primary) 6%)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>--</div>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--status-success)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            No Active Risk Signals
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
            All RFIs are closed, submittals approved, deliveries on time, schedule on track, and change orders signed.
          </div>
        </div>
      )}

      {/* ── Risk items list ── */}
      {displayItems.length > 0 && (
        <div style={{
          border: "1px solid color-mix(in srgb, var(--border-default) 82%, transparent)",
          borderRadius: 8,
          background: "color-mix(in srgb, var(--bg-surface) 94%, var(--text-primary) 6%)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid color-mix(in srgb, var(--border-default) 50%, transparent)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ ...mono, fontSize: 9, fontWeight: 850, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {activeSignal ? `${risk.signals.find(s => s.signal === activeSignal)?.label || "Filtered"} Items` : "Top Risks"}
            </span>
            {activeSignal && (
              <button
                type="button"
                onClick={() => setActiveSignal(null)}
                style={{
                  ...mono, fontSize: 8, fontWeight: 900, color: "var(--accent)",
                  background: "none", border: "none", cursor: "pointer",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}
              >
                Show All
              </button>
            )}
          </div>
          {displayItems.map((item, i) => (
            <RiskItemRow key={`${item.entityId}-${i}`} item={item} onNavigate={handleNavigate} />
          ))}
        </div>
      )}

      {/* ── Breakdowns ── */}
      {(risk.byArea.length > 0 || risk.byWorkPackage.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <BreakdownSection
            title="Exposure by Area"
            groups={risk.byArea}
            maxExposure={maxAreaExposure}
          />
          <BreakdownSection
            title="Exposure by Work Package"
            groups={risk.byWorkPackage}
            maxExposure={maxWpExposure}
            nameMap={wpNameMap}
          />
        </div>
      )}
    </OperationsPageShell>
    </div>
  );
}
