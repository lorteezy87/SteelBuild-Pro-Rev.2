import type { ComponentType, ReactNode } from "react";
import { mono, body } from "./constants";

interface TileProps {
  icon?: ComponentType<{ size?: number }> | null;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
}

interface DriftRowProps {
  row: {
    elapsedPct?: number | null;
    wpPct?: number | null;
    name?: ReactNode;
    phase?: ReactNode;
  };
  onClick?: () => void;
}

interface UrgentTileProps {
  item: {
    kind: ReactNode;
    title: ReactNode;
    subtitle: ReactNode;
    severity?: string | null;
    meta?: ReactNode;
  };
  onClick?: () => void;
}

interface WeekStatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  sub?: ReactNode;
}

interface HealthBucketProps {
  label: ReactNode;
  count: ReactNode;
  color: string;
  description: ReactNode;
}

interface ChartPanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

interface EmptyMicroProps {
  label: ReactNode;
}

interface ExecutiveColumnProps {
  title: string;
  accent: string;
  children: ReactNode;
}

interface ExecutiveLineProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

interface ExecutiveCalloutProps {
  color: string;
  children: ReactNode;
}

export function Tile({ icon: Icon, label, value, sub, accent, active, onClick, badge }: TileProps) {
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
        if (interactive && accent) e.currentTarget.style.borderColor = accent;
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
              background: `${accent || "var(--accent)"}1A`,
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
            color: "var(--accent-text)", background: "var(--status-error)",
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

export function DriftRow({ row, onClick }: DriftRowProps) {
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

export function UrgentTile({ item, onClick }: UrgentTileProps) {
  const SEV = {
    critical: "var(--status-error)",
    high: "var(--status-warning)",
    medium: "var(--status-info)",
    low: "var(--text-muted)",
  };
  const color = SEV[item.severity as keyof typeof SEV] || SEV.medium;
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

export function WeekStat({ label, value, color = "var(--text-primary)", sub }: WeekStatProps) {
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

export function HealthBucket({ label, count, color, description }: HealthBucketProps) {
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

export function ChartPanel({ title, subtitle, children }: ChartPanelProps) {
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

export function EmptyMicro({ label }: EmptyMicroProps) {
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

export function ExecutiveColumn({ title, accent, children }: ExecutiveColumnProps) {
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

export function ExecutiveLine({ label, value, color }: ExecutiveLineProps) {
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

export function ExecutiveCallout({ color, children }: ExecutiveCalloutProps) {
  return (
    <div style={{
      ...body, fontSize: 12, color,
      borderLeft: `3px solid ${color}`, paddingLeft: 10,
    }}>
      {children}
    </div>
  );
}
