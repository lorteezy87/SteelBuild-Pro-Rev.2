import { useState } from "react";
import { PauseCircle } from "lucide-react";
import { formatCurrency } from "@/components/shared/formatters";
import {
  calcWpProgress,
  calcLaborBurn,
  calcContractValue,
  calcDaysToDeadline,
  calcRfiHealth,
} from "@/utils/projectKpis";
import { HEALTH_CONFIG, PHASE_CONFIG, healthStyle, phaseStyle } from "./format";

/* ─────────────────────────────────────────────
   ProgressRing — 48px SVG ring
───────────────────────────────────────────── */
export function ProgressRing({ pct, size = 48, color = "var(--accent)" }: {
  pct: number;
  size?: number;
  color?: string;
}) {
  const r    = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ - (circ * Math.min(100, pct || 0)) / 100;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="var(--bg-surface-high)"
          strokeWidth={4.5}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4.5}
          strokeDasharray={circ}
          strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.55s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 800,
          color: "var(--text-primary)",
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mini stat card used inside ProjectCard
───────────────────────────────────────────── */
export function MiniStat({ label, value, valueColor = "var(--text-primary)" }: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <div style={{
      background: "var(--hover-bg)",
      border: "1px solid var(--border-default)",
      borderRadius: 4,
      padding: "7px 10px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 15,
        fontWeight: 800,
        color: valueColor,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Phase pill badge
───────────────────────────────────────────── */
export function PhasePill({ phase, config, size = "sm" }: {
  phase: string;
  config: { color: string; bg: string };
  size?: "sm" | "md";
}) {
  const isSm = size === "sm";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      background: config.bg,
      border: `1px solid ${config.color}45`,
      borderRadius: 3,
      padding: isSm ? "2px 7px" : "3px 9px",
      fontFamily: "var(--font-mono)",
      fontSize: isSm ? 8 : 9,
      fontWeight: 700,
      color: config.color,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      whiteSpace: "nowrap",
    }}>
      {phase}
    </span>
  );
}

/* ─────────────────────────────────────────────
   ProjectCard
───────────────────────────────────────────── */
export function ProjectCard({ project, workPackages, rfis, changeOrders, onClick, onEdit, onDelete }: {
  project: Record<string, unknown>;
  workPackages: Record<string, unknown>[];
  rfis: Record<string, unknown>[];
  changeOrders: Record<string, unknown>[];
  onClick: () => void;
  onEdit: (project: Record<string, unknown>) => void;
  onDelete: (project: Record<string, unknown>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const phase  = phaseStyle(project.phase as string);
  const health = healthStyle(project.health_status as string);
  const cardBorderColor = hovered ? "var(--accent-border)" : "var(--border-default)";

  const projectWPs = workPackages.filter(w => w.project_id === project.id);
  const projectRFIs = rfis.filter(r => r.project_id === project.id);
  const projectCOs  = changeOrders.filter(c => c.project_id === project.id);

  const { pct: wpPct, totalTons, completeTons, completeCount: completeWPs } = calcWpProgress(projectWPs);
  const { openCount: openRFIs, overdueCount: overdueRFIs } = calcRfiHealth(projectRFIs);
  const { approvedCOTotal: approvedCOs, revised: revisedContract, original: originalContract, pendingCOCount: pendingCOs } = calcContractValue(project, projectCOs);
  const { daysLeft, isOverdue } = calcDaysToDeadline(project);
  const { burnPct: laborBurn, isOverBudget } = calcLaborBurn(projectWPs);

  const contractDisplay = formatCurrency(revisedContract || originalContract);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-surface)",
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 4,
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopColor: cardBorderColor,
        borderRightColor: cardBorderColor,
        borderBottomColor: cardBorderColor,
        borderLeftColor: phase.color,
        borderRadius: 6,
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.12s",
        boxShadow: hovered
          ? "0 6px 28px rgba(0,0,0,0.30), 0 0 0 1px var(--accent-border)"
          : "var(--shadow-card)",
        transform: hovered ? "translateY(-2px)" : "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "16px 18px 12px 16px", opacity: project.on_hold ? 0.78 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <PhasePill phase={(project.phase as string) || "—"} config={phase} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {(project.project_number as string) || "—"}
          </span>
          {project.on_hold && (
            <span
              title={(project.on_hold_reason as string) || "Paused — excluded from every KPI rollup"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800,
                color: "var(--status-warning)",
                background: "var(--warning-muted)",
                border: "1px solid var(--warning-border)",
                padding: "2px 6px", borderRadius: 3,
                textTransform: "uppercase", letterSpacing: "0.10em",
              }}
            >
              <PauseCircle size={9} /> On Hold
            </span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.25,
              marginBottom: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {project.name as string}
            </div>
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {(project.general_contractor as string) || (project.client as string) || "—"}
            </div>
          </div>
          <ProgressRing pct={wpPct} color={phase.color} size={48} />
        </div>
      </div>

      <div style={{
        margin: "0 16px 12px 16px",
        background: "color-mix(in srgb, var(--text-primary) 25%, transparent)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 4,
          }}>
            Contract Value
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 17,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            {contractDisplay}
          </div>
        </div>
        {approvedCOs !== 0 && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: approvedCOs > 0 ? "var(--success)" : "var(--danger)",
            background: approvedCOs > 0 ? "var(--success-muted)" : "var(--danger-muted)",
            border: `1px solid ${approvedCOs > 0 ? "var(--success-border)" : "var(--danger-border)"}`,
            borderRadius: 3,
            padding: "2px 7px",
          }}>
            {approvedCOs > 0 ? "+" : ""}{formatCurrency(approvedCOs)}
          </span>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 6,
        margin: "0 16px 14px 16px",
      }}>
        <MiniStat
          label="Open RFIs"
          value={openRFIs}
          valueColor={openRFIs > 0 ? (overdueRFIs > 0 ? "var(--danger)" : "var(--warning)") : "var(--text-muted)"}
        />
        <MiniStat
          label="Pend COs"
          value={pendingCOs}
          valueColor={pendingCOs > 0 ? "var(--warning)" : "var(--text-muted)"}
        />
        <MiniStat
          label="WPs"
          value={`${completeWPs}/${projectWPs.length}`}
          valueColor={phase.color}
        />
        <MiniStat
          label={totalTons > 0 ? "Tons" : "Labor"}
          value={totalTons > 0 ? `${completeTons}T` : `${laborBurn}%`}
          valueColor={isOverBudget ? "var(--danger)" : "var(--text-secondary)"}
        />
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 16px",
        borderTop: "1px solid var(--divider)",
        marginTop: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: health.dot,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: health.color,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
          }}>
            {(project.health_status as string) || "On Track"}
          </span>
        </div>

        {daysLeft !== null && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: daysLeft < 30 ? 700 : 400,
            color: isOverdue ? "var(--danger)" : daysLeft < 30 ? "var(--warning)" : "var(--text-muted)",
          }}>
            {isOverdue ? `${Math.abs(daysLeft)}d OVERDUE` : `${daysLeft}d left`}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--on-accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          style={{
            background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 3,
            padding: "3px 9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em",
            textTransform: "uppercase", transition: "border-color 0.12s, color 0.12s",
          }}
        >
          EDIT
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--danger-border)"; e.currentTarget.style.color = "var(--danger)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          style={{
            background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 3,
            padding: "3px 9px", color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            fontSize: 8, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em",
            textTransform: "uppercase", transition: "border-color 0.12s, color 0.12s",
          }}
        >
          ARCHIVE
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KPI card used in the metric strip
───────────────────────────────────────────── */
export function KpiCard({ label, value, sub, alert = false, alertColor = "var(--status-error)", onClick, active = false }: {
  label: string;
  value: string | number;
  sub: string;
  alert?: boolean;
  alertColor?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const borderColor = active ? "var(--accent-border)" : hovered ? "var(--border-strong)" : "var(--border-default)";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        minWidth: 130,
        background: active ? "var(--accent-muted)" : "var(--bg-surface)",
        borderTopWidth: alert ? 2 : 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopColor: alert ? alertColor : active ? "var(--accent-border)" : "var(--border-default)",
        borderRightColor: borderColor,
        borderBottomColor: borderColor,
        borderLeftColor: borderColor,
        borderRadius: 4,
        padding: "14px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        marginBottom: 7,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 700,
        color: alert ? alertColor : active ? "var(--accent)" : "var(--text-primary)",
        letterSpacing: "-0.03em",
        lineHeight: 1,
        marginBottom: 5,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "0.04em",
      }}>
        {sub}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Filter pill button
───────────────────────────────────────────── */
export function FilterPill({ label, color, active, onClick }: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: active ? "var(--accent-muted)" : "transparent",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        borderRadius: 3,
        padding: "4px 11px",
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        fontWeight: 700,
        color: active ? (color || "var(--accent)") : "var(--text-muted)",
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {color && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? color : "var(--text-muted)",
          flexShrink: 0,
          transition: "background 0.12s",
        }} />
      )}
      {label}
    </button>
  );
}

// Re-export configs for consumers that import from components
export { PHASE_CONFIG, HEALTH_CONFIG };
