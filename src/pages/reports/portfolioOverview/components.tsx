/**
 * Presentational sections for Portfolio Overview — hero KPI strip, project
 * matrix wrapper, and shared tile/section micro-components.
 */
import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, Building2, CircleDot, DollarSign,
  Layers, ShieldAlert, TrendingUp,
} from "lucide-react";
import { formatCurrencyShort } from "@/components/shared/formatters";
import { mono, body } from "../constants";
import ProjectStatusMatrix from "../ProjectStatusMatrix";

/* ── shared Tile (project-dashboard vocabulary) ── */
export function Tile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  active,
  onClick,
  badge,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | null;
}) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${active ? accent : "var(--border-default)"}`,
        borderRadius: 10,
        padding: "14px 16px",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 0.12s, transform 0.12s",
        position: "relative",
        outline: active ? `1px solid ${accent}` : "none",
      }}
      onMouseEnter={(e) => {
        if (interactive) e.currentTarget.style.borderColor = accent || "";
      }}
      onMouseLeave={(e) => {
        if (interactive && !active) e.currentTarget.style.borderColor = "var(--border-default)";
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && (
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: (accent || "") + "1A",
              color: accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={13} />
            </div>
          )}
          <div style={{
            ...mono, fontSize: 9, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            {label}
          </div>
        </div>
        {badge != null && (
          <span style={{
            ...mono, fontSize: 8, fontWeight: 700,
            color: "#fff", background: "var(--status-error)",
            borderRadius: "var(--radius-badge)",
            padding: "2px 6px",
            textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        ...mono, fontSize: 22, fontWeight: 700,
        color: accent || "var(--text-primary)",
        lineHeight: 1.1, marginBottom: 4,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export type HeroKpiStripProps = {
  projectsCount: number;
  activeProjectsCount: number;
  portfolioRevised: number;
  portfolioContract: number;
  openRFIsCount: number;
  overdueRFIsCount: number;
  rfisTotal: number;
  pendingCOsCount: number;
  pendingCOValue: number;
  criticalAlertCount: number;
  critRfisCount: number;
  criticalRisksCount: number;
  lateDeliveriesCount: number;
  overdueActionsCount: number;
  openActionsCount: number;
  tonsProduced: number;
  tonsPlanned: number;
  kpiFilter: string | null;
  onKpiFilter: (key: string | null) => void;
};

/** Eight-tile hero strip — click toggles matrix KPI filters. */
export function HeroKpiStrip({
  projectsCount,
  activeProjectsCount,
  portfolioRevised,
  portfolioContract,
  openRFIsCount,
  overdueRFIsCount,
  rfisTotal,
  pendingCOsCount,
  pendingCOValue,
  criticalAlertCount,
  critRfisCount,
  criticalRisksCount,
  lateDeliveriesCount,
  overdueActionsCount,
  openActionsCount,
  tonsProduced,
  tonsPlanned,
  kpiFilter,
  onKpiFilter,
}: HeroKpiStripProps) {
  const toggle = (key: string) => onKpiFilter(kpiFilter === key ? null : key);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 10,
    }}>
      <Tile
        icon={Building2}
        label="Total Projects"
        value={projectsCount}
        sub={`${activeProjectsCount} active · ${projectsCount - activeProjectsCount} closed`}
        accent="var(--accent)"
      />
      <Tile
        icon={Activity}
        label="Active Projects"
        value={activeProjectsCount}
        sub={`${projectsCount - activeProjectsCount} in Closeout`}
        accent="var(--status-info)"
        active={kpiFilter === "active"}
        onClick={() => toggle("active")}
      />
      <Tile
        icon={DollarSign}
        label="Contract Value"
        value={formatCurrencyShort(portfolioRevised)}
        sub={`Original ${formatCurrencyShort(portfolioContract)} · revised ${formatCurrencyShort(portfolioRevised - portfolioContract)}`}
        accent="var(--status-success-bright)"
        active={kpiFilter === "value"}
        onClick={() => toggle("value")}
      />
      <Tile
        icon={CircleDot}
        label="Open RFIs"
        value={openRFIsCount}
        sub={`${overdueRFIsCount} overdue · ${rfisTotal} total`}
        accent="var(--status-warning)"
        badge={overdueRFIsCount > 0 ? `${overdueRFIsCount} overdue` : null}
        active={kpiFilter === "rfis"}
        onClick={() => toggle("rfis")}
      />
      <Tile
        icon={Layers}
        label="Pending COs"
        value={pendingCOsCount}
        sub={`${formatCurrencyShort(pendingCOValue)} pending value`}
        accent="#F97316"
        active={kpiFilter === "cos"}
        onClick={() => toggle("cos")}
      />
      <Tile
        icon={ShieldAlert}
        label="Critical Alerts"
        value={criticalAlertCount}
        sub={`${critRfisCount} crit RFIs · ${criticalRisksCount} crit risks · ${lateDeliveriesCount} late deliv.`}
        accent="var(--status-error)"
        active={kpiFilter === "alerts"}
        onClick={() => toggle("alerts")}
      />
      <Tile
        icon={AlertTriangle}
        label="Overdue Actions"
        value={overdueActionsCount}
        sub={`${openActionsCount} open total`}
        accent="var(--status-error)"
        badge={overdueActionsCount > 0 ? "past due" : null}
        active={kpiFilter === "overdue"}
        onClick={() => toggle("overdue")}
      />
      <Tile
        icon={TrendingUp}
        label="Tons Produced"
        value={tonsProduced.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        sub={
          tonsPlanned > 0
            ? `${((tonsProduced / tonsPlanned) * 100).toFixed(0)}% of ${tonsPlanned.toLocaleString("en-US", { maximumFractionDigits: 0 })}t planned`
            : "no WP tonnage"
        }
        accent="var(--phase-fab)"
      />
    </div>
  );
}

export type ProjectMatrixSectionProps = {
  viewMode: string;
  filteredRows: unknown[];
  sortField: string;
  sortDir: string;
  onSort: (field: string) => void;
  kpiFilter: string | null;
  onClearFilter: () => void;
  search: string;
  navigate: (path: string) => void;
};

/** Sortable project status matrix with KPI filter chrome. */
export function ProjectMatrixSection({
  viewMode,
  filteredRows,
  sortField,
  sortDir,
  onSort,
  kpiFilter,
  onClearFilter,
  search,
  navigate,
}: ProjectMatrixSectionProps) {
  return (
    <ProjectStatusMatrix
      title={viewMode === "executive" ? "Project Overview" : "Project Status Matrix"}
      filteredRows={filteredRows}
      sortField={sortField}
      sortDir={sortDir}
      onSort={onSort}
      kpiFilter={kpiFilter}
      onClearFilter={onClearFilter}
      search={search}
      navigate={navigate}
    />
  );
}

export function DriftRow({
  row,
  onClick,
}: {
  row: { name: string; phase: string; elapsedPct?: number; wpPct?: number };
  onClick?: () => void;
}) {
  const elapsed = Math.max(0, Math.min(100, row.elapsedPct || 0));
  const complete = Math.max(0, Math.min(100, row.wpPct || 0));
  const drift = elapsed - complete;
  const driftColor =
    drift >= 25 ? "var(--status-error)"
      : drift >= 10 ? "var(--status-warning)"
      : "var(--status-success)";
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 2fr) 1fr 90px",
        gap: 14,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-surface-low)")}
    >
      <div style={{ overflow: "hidden" }}>
        <div style={{
          ...body, fontSize: 12, fontWeight: 600,
          color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.name}
        </div>
        <div style={{
          ...mono, fontSize: 9, color: "var(--text-muted)",
          letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
        }}>
          {row.phase}
        </div>
      </div>
      <div style={{ position: "relative", height: 18 }}>
        <div style={{
          position: "absolute", inset: 0,
          height: 6, top: 4,
          background: "var(--bg-surface-high)",
          borderRadius: 3,
        }} />
        <div style={{
          position: "absolute", left: 0, top: 4,
          width: `${elapsed}%`, height: 6,
          background: "var(--text-muted)",
          borderRadius: 3,
          opacity: 0.7,
        }} />
        <div style={{
          position: "absolute", left: 0, top: 4,
          width: `${complete}%`, height: 6,
          background: driftColor,
          borderRadius: 3,
        }} />
      </div>
      <div style={{
        ...mono, fontSize: 11, fontWeight: 700,
        color: driftColor,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}>
        {complete.toFixed(0)}% / {elapsed.toFixed(0)}%
      </div>
    </div>
  );
}

export function UrgentTile({
  item,
  onClick,
}: {
  item: {
    kind: string;
    title: string;
    subtitle: string;
    severity: string;
    meta?: string;
  };
  onClick?: () => void;
}) {
  const SEV: Record<string, string> = {
    critical: "var(--status-error)",
    high: "var(--status-warning)",
    medium: "var(--status-info)",
    low: "var(--text-muted)",
  };
  const color = SEV[item.severity] || SEV.medium;
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 240, maxWidth: 280, flexShrink: 0,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
    >
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: 6,
      }}>
        <span style={{
          ...mono, fontSize: 8, fontWeight: 700, color,
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          {item.kind}
        </span>
        <span style={{
          ...mono, fontSize: 8, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {item.severity}
        </span>
      </div>
      <div style={{
        ...body, fontSize: 12, fontWeight: 600,
        color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3,
      }}>
        {item.title}
      </div>
      <div style={{
        ...body, fontSize: 11, color: "var(--text-secondary)",
        marginBottom: 4, lineHeight: 1.4,
        overflow: "hidden", textOverflow: "ellipsis",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {item.subtitle}
      </div>
      {item.meta && (
        <div style={{
          ...mono, fontSize: 8, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.meta}
        </div>
      )}
    </div>
  );
}

export function WeekStat({
  label,
  value,
  color = "var(--text-primary)",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 8,
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        ...mono, fontSize: 18, fontWeight: 700,
        color, lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function HealthBucket({
  label,
  count,
  color,
  description,
}: {
  label: string;
  count: number;
  color: string;
  description: string;
}) {
  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-muted)", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        ...mono, fontSize: 22, fontWeight: 700, color, lineHeight: 1,
        marginBottom: 6, fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </div>
      <div style={{
        ...body, fontSize: 11, color: "var(--text-secondary)",
      }}>
        {description}
      </div>
    </div>
  );
}

export function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.10em", textTransform: "uppercase",
        color: "var(--text-primary)", marginBottom: 4,
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          ...body, fontSize: 11, color: "var(--text-muted)", marginBottom: 12,
        }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyMicro({ label }: { label: string }) {
  return (
    <div style={{
      padding: "32px 16px", textAlign: "center",
      ...mono, fontSize: 10,
      color: "var(--text-muted)",
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}

export function ExecutiveColumn({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        ...mono, fontSize: 9, fontWeight: 700,
        letterSpacing: "0.12em", color: accent, marginBottom: 10,
      }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

export function ExecutiveLine({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span style={{ ...body, fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{
        ...mono, fontSize: 14, fontWeight: 700, color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

export function ExecutiveCallout({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      ...body, fontSize: 12, color,
      borderLeft: `3px solid ${color}`, paddingLeft: 10,
    }}>
      {children}
    </div>
  );
}
