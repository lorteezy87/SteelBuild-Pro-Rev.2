import type { ComponentType, CSSProperties, ReactNode } from "react";
import DonutChartRaw from "@/components/shared/DonutChart";
import TrendIndicatorRaw from "@/components/shared/TrendIndicator";
import EmptyStateActionRaw from "@/components/shared/EmptyStateAction";
import { SEVERITY, IMPACT_TAGS } from "@/utils/pccEngine";
import { TYPE_CONFIG, TYPE_PAGE_MAP } from "./format";
import type { PCCItem, PCCSeverity } from "./types";

// These shared components are still .jsx; cast at the boundary (removable
// once they are typed).
type AnyProps = Record<string, any>;
const DonutChart = DonutChartRaw as unknown as ComponentType<AnyProps>;
const TrendIndicator = TrendIndicatorRaw as unknown as ComponentType<AnyProps>;
const EmptyStateAction = EmptyStateActionRaw as unknown as ComponentType<AnyProps>;

interface SignalCardProps {
  label: string;
  value: number | string;
  color?: string;
  sub?: string;
  onClick?: () => void;
  active?: boolean;
  previous?: number;
  invertTrend?: boolean;
}

export function SignalCard({ label, value, color, sub, onClick, active, previous, invertTrend }: SignalCardProps) {
  const numericValue = typeof value === "number" ? value : parseInt(value, 10);
  const hasValue = !isNaN(numericValue) && numericValue > 0;
  const isCritical = hasValue && (label === "CRITICAL" || label === "OVERDUE") && numericValue >= 3;
  const isClickable = !!onClick && hasValue;

  // Multi-layer glow: subtle ambient + focused edge glow
  const glowShadow = hasValue
    ? `0 0 20px ${color}30, 0 0 6px ${color}18, inset 0 1px 0 ${color}12`
    : "var(--shadow-card, none)";

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={isCritical ? "signal-card-pulse" : undefined}
      style={{
        flex: 1,
        minWidth: 100,
        minHeight: 44,
        padding: "14px 18px",
        background: active ? "rgba(200,155,32,0.07)" : "var(--bg-surface)",
        border: `1px solid ${active ? "rgba(200,155,32,0.30)" : hasValue ? `${color}45` : "var(--divider)"}`,
        borderRadius: "var(--radius-card, 10px)",
        cursor: isClickable ? "pointer" : "default",
        boxShadow: glowShadow,
        transition: "box-shadow 0.4s ease, border-color 0.3s ease, background 0.15s ease, transform 0.15s ease",
        position: "relative",
      }}
      title={isClickable ? `Click to filter: ${label}` : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 4 }}>
          {label}
        </div>
        {isClickable && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: active ? "var(--accent)" : "var(--text-muted)", opacity: active ? 1 : 0.5, transition: "opacity 0.15s" }}>
            {active ? "✕" : "→"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: color || "var(--text-primary)", lineHeight: 1,
          borderBottom: isClickable ? `1px dashed ${color}40` : "none",
          paddingBottom: isClickable ? 2 : 0,
        }}>
          {value}
        </div>
        <TrendIndicator current={numericValue} previous={previous} invert={!!invertTrend} />
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: PCCSeverity }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
      padding: "3px 8px", borderRadius: "var(--radius-badge, 6px)",
      background: severity.bg, color: severity.color, border: `1px solid ${severity.border}`,
      whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.2,
    }}>
      {severity.label}
    </span>
  );
}

// ─── Next-action badge ────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
      padding: "3px 10px", borderRadius: "var(--radius-badge, 6px)",
      background: "rgba(200,155,32,0.10)", color: "var(--accent)",
      border: "1px solid rgba(200,155,32,0.22)", whiteSpace: "nowrap", flexShrink: 0,
      lineHeight: 1.2,
    }}>
      &rarr; {action}
    </span>
  );
}

// ─── Impact tag ───────────────────────────────────────────────────────────────
function ImpactTag({ tagKey }: { tagKey: string }) {
  const tag = IMPACT_TAGS[tagKey];
  if (!tag) return null;
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.08em",
      padding: "2px 7px", borderRadius: 4,
      background: `${tag.color}15`, color: tag.color,
      border: `1px solid ${tag.color}30`, whiteSpace: "nowrap", lineHeight: 1.2,
    }}>
      {tag.label}
    </span>
  );
}

// ─── Priority feed row (card-based layout) ──────────────────────────────────
interface PriorityRowProps {
  item: PCCItem;
  expanded: boolean;
  onToggle: () => void;
  onOpenDrawer: (item: PCCItem) => void;
  onNavigateTitle?: (item: PCCItem) => void;
}

export function PriorityRow({ item, expanded, onToggle, onOpenDrawer, onNavigateTitle }: PriorityRowProps) {
  const tc = TYPE_CONFIG[item.type] || { icon: "◉", label: item.type, color: "var(--text-muted)" };
  const overdueTxt = item.overdueDays > 0
    ? `${item.overdueDays}d overdue`
    : item.dueSoonDays !== null
      ? `Due in ${item.dueSoonDays}d`
      : null;

  return (
    <div
      style={{
        display: "flex",
        background: expanded ? "var(--hover-bg)" : "var(--bg-card, var(--bg-surface))",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card, 10px)",
        minHeight: 48,
        overflow: "hidden",
        transition: "background 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {/* Severity color stripe — left edge, 4px, full height */}
      <div style={{ width: 4, flexShrink: 0, background: item.severity.color }} />

      {/* Content area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Main clickable row */}
        <div
          onClick={onToggle}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 14px",
            cursor: "pointer",
            minHeight: 48,
            justifyContent: "center",
          }}
        >
          {/* Top row: score + severity + type + title + drawer button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {/* Score */}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: item.severity.color, flexShrink: 0, minWidth: 24, textAlign: "right" }}>
              {item.score}
            </span>

            {/* Severity badge */}
            <SeverityBadge severity={item.severity} />

            {/* Type badge */}
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.09em",
              color: tc.color, background: `${tc.color}15`, border: `1px solid ${tc.color}30`,
              padding: "3px 8px", borderRadius: "var(--radius-badge, 6px)", whiteSpace: "nowrap", flexShrink: 0,
              lineHeight: 1.2,
            }}>
              {tc.icon} {tc.label}
            </span>

            {/* Title — deep-link clickable */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                onClick={(e) => { e.stopPropagation(); onNavigateTitle?.(item); }}
                style={{
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
                  color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  cursor: "pointer", borderBottom: "1px solid transparent",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderBottomColor = "var(--accent)"}
                onMouseLeave={(e) => e.currentTarget.style.borderBottomColor = "transparent"}
                title={`Open ${item.type}: ${item.subtitle || item.title}`}
              >
                {item.title}
              </span>
              {item.subtitle && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em", flexShrink: 0 }}>
                  {item.subtitle}
                </span>
              )}
            </div>

            {/* Drawer button — 36x36 touch-friendly */}
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDrawer(item); }}
              title="View details"
              style={{
                background: "var(--hover-bg)", border: "1px solid var(--bg-surface-high)",
                borderRadius: "var(--radius-btn, 8px)", width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, flexShrink: 0,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--border-default)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
            >⤢</button>
          </div>

          {/* Bottom row: timing + owner + reason + next action */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 32, flexWrap: "wrap" }}>
            {/* Timing */}
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
              color: item.overdueDays > 0 ? "var(--status-error)" : item.dueSoonDays !== null && item.dueSoonDays <= 7 ? "var(--status-warning)" : "var(--text-muted)",
              whiteSpace: "nowrap",
            }}>
              {overdueTxt || (item.due_date ? new Date(item.due_date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "—")}
            </span>

            {/* Owner */}
            <span style={{
              fontFamily: "var(--font-body)", fontSize: 11, color: item.assigned_to ? "var(--text-secondary)" : "rgba(255,100,100,0.55)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140,
            }}>
              {item.assigned_to || "Unassigned"}
            </span>

            {/* Reason (top 1) */}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
              {item.reasons[0] || ""}
            </span>

            {/* Next action */}
            <ActionBadge action={item.nextAction} />
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div style={{ padding: "10px 14px 14px 46px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--divider)", animation: "fadeIn 0.2s ease" }}>
            {/* Impact tags */}
            {(Array.isArray(item.tags) ? item.tags : []).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Array.isArray(item.tags) ? item.tags : []).map((t) => <ImpactTag key={t} tagKey={t} />)}
              </div>
            )}

            {/* All reasons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {item.reasons.map((r, i) => (
                <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "var(--hover-bg)", border: "1px solid var(--divider)", padding: "3px 10px", borderRadius: 5 }}>
                  {r}
                </span>
              ))}
            </div>

            {/* Detail row */}
            <div style={{ display: "flex", gap: 24 }}>
              {item.project_name && (
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 3 }}>PROJECT</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{item.project_name}</div>
                </div>
              )}
              {item.waiting_on && (
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 3 }}>WAITING ON</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--status-warning)" }}>{item.waiting_on}</div>
                </div>
              )}
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 3 }}>SCORE BREAKDOWN</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: item.severity.color, fontWeight: 700 }}>
                  {item.score} pts &rarr; {item.severity.label}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  item: PCCItem | null;
  onClose: () => void;
  onNavigate?: (item: PCCItem) => void;
}

export function DetailDrawer({ item, onClose, onNavigate }: DetailDrawerProps) {
  if (!item) return null;
  const tc = TYPE_CONFIG[item.type] || { icon: "◉", label: item.type, color: "var(--text-muted)" };
  const overdueTxt = item.overdueDays > 0
    ? `${item.overdueDays} days overdue`
    : item.dueSoonDays !== null
      ? `Due in ${item.dueSoonDays} days`
      : item.due_date
        ? new Date(item.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "No due date";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 400,
        background: "var(--glass-bg, rgba(20,23,28,0.92))",
        borderLeft: "1px solid var(--glass-border, rgba(255,255,255,0.06))",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        boxShadow: "-16px 0 48px rgba(0,0,0,0.60), -4px 0 16px rgba(0,0,0,0.30)", zIndex: 51,
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideInRight 0.25s ease-out",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.09em",
                  color: tc.color, background: `${tc.color}15`, border: `1px solid ${tc.color}30`,
                  padding: "2px 7px", borderRadius: 4,
                }}>
                  {tc.icon} {tc.label}
                </span>
                <SeverityBadge severity={item.severity} />
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35 }}>
                {item.title}
              </div>
              {item.subtitle && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 4 }}>
                  {item.subtitle}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", flexShrink: 0, lineHeight: 1, padding: 2 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Score card */}
          <div style={{ background: `${item.severity.color}0D`, border: `1px solid ${item.severity.color}30`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>PRIORITY SCORE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 800, color: item.severity.color, lineHeight: 1 }}>{item.score}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>pts → {item.severity.label}</span>
            </div>
          </div>

          {/* Timing */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>TIMING</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
              color: item.overdueDays > 0 ? "var(--status-error)" : item.dueSoonDays !== null && item.dueSoonDays <= 7 ? "var(--status-warning)" : "var(--text-secondary)",
            }}>
              {overdueTxt}
            </div>
          </div>

          {/* Reasons */}
          {item.reasons.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>WHY IT'S RANKED HERE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {item.reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 6 }}>
                    <span style={{ color: item.severity.color, fontSize: 10, lineHeight: 1 }}>▸</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact tags */}
          {(Array.isArray(item.tags) ? item.tags : []).length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>DOWNSTREAM IMPACT</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Array.isArray(item.tags) ? item.tags : []).map((t) => <ImpactTag key={t} tagKey={t} />)}
              </div>
            </div>
          )}

          {/* Ownership */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>OWNER</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: item.assigned_to ? "var(--text-secondary)" : "rgba(255,100,100,0.70)" }}>
                {item.assigned_to || "Unassigned"}
              </div>
            </div>
            {item.waiting_on && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>WAITING ON</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--status-warning)" }}>{item.waiting_on}</div>
              </div>
            )}
            {item.project_name && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>PROJECT</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{item.project_name}</div>
              </div>
            )}
            {item.status && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>STATUS</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{item.status}</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — next action */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-default)", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 8 }}>RECOMMENDED ACTION</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{
              flex: 1, background: "var(--accent)", border: "none", borderRadius: 6,
              padding: "9px 14px", minHeight: 44, color: "#07090E", fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 800, cursor: "pointer", letterSpacing: "0.09em", textTransform: "uppercase",
            }}>
              → {item.nextAction}
            </button>
            {onNavigate && TYPE_PAGE_MAP[item.type] && (
              <button
                onClick={() => { onNavigate(item); onClose(); }}
                style={{
                  background: "var(--hover-bg)", border: "1px solid var(--border-default)",
                  borderRadius: 6, padding: "9px 14px", minHeight: 44, color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
                }}
              >
                VIEW {TYPE_CONFIG[item.type]?.label || item.type} →
              </button>
            )}
            <button onClick={onClose} style={{
              background: "var(--hover-bg)", border: "1px solid var(--bg-surface-high)",
              borderRadius: 6, padding: "9px 14px", minHeight: 44, color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              DISMISS
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Morning Scan ─────────────────────────────────────────────────────────────
interface MorningScanProps {
  items: PCCItem[];
  onSelect: (item: PCCItem) => void;
  onViewBriefing?: () => void;
  onViewFeed?: () => void;
}

export function MorningScan({ items, onSelect, onViewBriefing, onViewFeed }: MorningScanProps) {
  const top = items.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").slice(0, 10);
  if (!top.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "rgba(0,214,143,0.20)" }}>✓</div>
        <EmptyStateAction
          message="All clear — no critical or high-risk items need attention right now"
          actions={[
            ...(onViewBriefing ? [{ label: "View Daily Brief", onClick: onViewBriefing }] : []),
            ...(onViewFeed ? [{ label: "Browse Full Feed", onClick: onViewFeed, secondary: true }] : []),
          ]}
        />
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
          TOP {top.length} ITEMS REQUIRING ATTENTION TODAY
        </div>
      </div>
      {top.map((item, i) => {
        const tc = TYPE_CONFIG[item.type] || { icon: "◉", label: item.type, color: "var(--text-muted)" };
        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 20px", borderBottom: "1px solid var(--divider)",
              cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {/* Index */}
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${item.severity.color}15`, border: `1px solid ${item.severity.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: item.severity.color }}>{i + 1}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <SeverityBadge severity={item.severity} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: tc.color }}>{tc.label}</span>
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                {item.reasons.slice(0, 2).map((r, ri) => (
                  <span key={ri} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{r}</span>
                ))}
              </div>
            </div>

            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <ActionBadge action={item.nextAction} />
              {item.overdueDays > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 4 }}>{item.overdueDays}d overdue</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Waiting-On Board ─────────────────────────────────────────────────────────
export function WaitingOnBoard({ board, onViewRFIs }: { board: any[]; onViewRFIs?: () => void }) {
  if (!board.length) {
    return (
      <EmptyStateAction
        icon="◎"
        message="No items waiting on external parties — all responses are in-hand"
        actions={onViewRFIs ? [{ label: "Review Open RFIs", onClick: onViewRFIs }] : []}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px" }}>
      {board.map(({ party, items, count }) => (
        <div key={party} style={{ background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--divider)", background: "var(--hover-bg)" }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{party}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", background: "rgba(255,180,0,0.10)", border: "1px solid rgba(255,180,0,0.22)", padding: "1px 7px", borderRadius: 3 }}>
              {count} ITEMS
            </span>
          </div>
          {items.slice(0, 3).map((item: PCCItem) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid var(--divider)" }}>
              <SeverityBadge severity={item.severity} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.overdueDays > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", whiteSpace: "nowrap" }}>
                  {item.overdueDays}d overdue
                </span>
              )}
            </div>
          ))}
          {count > 3 && (
            <div style={{ padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              +{count - 3} MORE
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Risk Watchlist (high severity items grouped by impact) ───────────────────
interface RiskWatchlistProps {
  items: PCCItem[];
  onSelect?: (item: PCCItem) => void;
  onViewSchedule?: () => void;
}

export function RiskWatchlist({ items, onSelect, onViewSchedule }: RiskWatchlistProps) {
  const high = items.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").slice(0, 8);
  if (!high.length) {
    return (
      <EmptyStateAction
        icon="◇"
        message="No high-risk items — nothing is currently flagged as critical or high severity"
        actions={onViewSchedule ? [{ label: "Check Schedule", onClick: onViewSchedule }] : []}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {high.map((item) => (
        <div key={item.id} onClick={() => onSelect?.(item)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--divider)", cursor: "pointer" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <div style={{ width: 3, height: 28, background: item.severity.color, borderRadius: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.title}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              {(Array.isArray(item.tags) ? item.tags : []).slice(0, 2).map((t) => <ImpactTag key={t} tagKey={t} />)}
            </div>
          </div>
          <ActionBadge action={item.nextAction} />
        </div>
      ))}
    </div>
  );
}

export function DailyBriefing({ briefing, onSelect }: { briefing: any; onSelect: (item: PCCItem) => void }) {
  const sections = [
    {
      key: "criticalReleases",
      title: "TODAY'S CRITICAL RELEASES",
      subtitle: "Release-blocking confirmations that can affect fabrication, shipping, delivery, or erection.",
      empty: "No critical release blockers detected",
    },
    {
      key: "waitingOn",
      title: "WAITING ON",
      subtitle: "External or owner-held items that need follow-up before work can move.",
      empty: "No external waiting items detected",
    },
    {
      key: "next48",
      title: "NEXT 48 HOURS",
      subtitle: "Near-term work due inside the next two days.",
      empty: "No high-signal 48-hour items detected",
    },
    {
      key: "scheduleRisk",
      title: "SCHEDULE RISK",
      subtitle: "Tasks with missing owners, blocked status, milestones, or gate risk.",
      empty: "No schedule risk items detected",
    },
    {
      key: "costExposure",
      title: "COST EXPOSURE",
      subtitle: "Change or cost-related items that need commercial attention.",
      empty: "No cost exposure items detected",
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "grid", gap: 12 }}>
      <div style={{ padding: "14px 16px", background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em", fontWeight: 800 }}>
          DAILY PM BRIEFING
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.45 }}>
          A deterministic morning agenda built from RFIs, drawings, work packages, deliveries, change orders, and schedule tasks. It flags what is due, blocked, waiting, ownerless, or able to hurt fabrication, shipping, erection, or cost.
        </div>
      </div>

      {sections.map((section) => (
        <BriefingSection
          key={section.key}
          title={section.title}
          subtitle={section.subtitle}
          empty={section.empty}
          items={briefing[section.key] || []}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface BriefingSectionProps {
  title: string;
  subtitle: string;
  items: any[];
  empty: string;
  onSelect?: (item: PCCItem) => void;
}

function BriefingSection({ title, subtitle, items, empty, onSelect }: BriefingSectionProps) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--divider)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", letterSpacing: "0.12em", fontWeight: 800 }}>{title}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{subtitle}</div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: items.length > 0 ? "var(--accent)" : "var(--text-muted)", border: "1px solid var(--divider)", borderRadius: 6, padding: "3px 8px" }}>
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          {empty}
        </div>
      ) : (
        items.map((item) => {
          const tc = TYPE_CONFIG[item.type] || { label: item.type, color: "var(--text-muted)" };
          return (
            <button
              key={`${title}-${item.id}`}
              type="button"
              onClick={() => onSelect?.(item)}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <SeverityBadge severity={item.severity} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: tc.color, letterSpacing: "0.08em" }}>{tc.label}</span>
                  {item.waitingParty && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>WAITING: {item.waitingParty}</span>
                  )}
                  {item.daysOut != null && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.daysOut <= 2 ? "var(--status-warning)" : "var(--text-muted)" }}>
                      {item.daysOut === 0 ? "TODAY" : `${item.daysOut}D`}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {(item.reasons || []).slice(0, 2).map((reason: string, idx: number) => (
                    <span key={idx} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{reason}</span>
                  ))}
                </div>
              </div>
              <ActionBadge action={item.nextAction} />
            </button>
          );
        })
      )}
    </div>
  );
}

export function ReleaseGateActionDrafts({ drafts, onCreate, creatingKey }: { drafts: any[]; onCreate?: (draft: any) => void; creatingKey: string | null }) {
  if (!drafts.length) {
    return (
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)", background: "rgba(63,185,80,0.04)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-success)", letterSpacing: "0.10em", fontWeight: 800 }}>
          ACTION DRAFTS CLEAR
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          No unassigned release-gate tasks need to be created from the current PCC data.
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--divider)", background: "rgba(86,176,255,0.04)" }}>
      <div style={{ padding: "12px 20px 8px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 800 }}>
          SUGGESTED ACTION ITEMS
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          These are generated from missing release confirmations. Creating one adds an Action Item; it does not auto-approve or change the source record.
        </div>
      </div>
      {drafts.slice(0, 8).map((draft) => (
        <div
          key={draft.key}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "center",
            margin: "0 20px 8px",
            padding: "10px 12px",
            border: "1px solid var(--accent-border)",
            borderRadius: 10,
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 800, letterSpacing: "0.10em", color: draft.priority === "Critical" ? "var(--status-error)" : "var(--status-warning)" }}>
                {draft.priority}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                DUE {draft.due_date || "TBD"}
              </span>
              {draft.assigned_to && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  OWNER {draft.assigned_to}
                </span>
              )}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {draft.title}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {draft.metadata?.missing_confirmation}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCreate?.(draft)}
            disabled={creatingKey === draft.key}
            style={{
              minHeight: 36,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: creatingKey === draft.key ? "var(--bg-surface)" : "var(--accent)",
              color: creatingKey === draft.key ? "var(--text-muted)" : "#06101d",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.08em",
              cursor: creatingKey === draft.key ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {creatingKey === draft.key ? "CREATING..." : "CREATE TASK"}
          </button>
        </div>
      ))}
    </div>
  );
}

interface ExecutionWindowProps {
  title: string;
  subtitle: string;
  items: PCCItem[];
  empty: string;
  onSelect?: (item: PCCItem) => void;
  beforeList?: ReactNode;
  emptyActions?: any[];
}

export function ExecutionWindow({ title, subtitle, items, empty, onSelect, beforeList = null, emptyActions = [] }: ExecutionWindowProps) {
  if (!items.length) {
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        {beforeList}
        <EmptyStateAction
          icon="◎"
          message={empty}
          actions={emptyActions}
        />
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", fontWeight: 800 }}>{title}</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{subtitle}</div>
      </div>
      {beforeList}
      {items.map((item) => {
        const tc = TYPE_CONFIG[item.type] || { label: item.type, color: "var(--text-muted)" };
        return (
          <div
            key={item.id}
            onClick={() => onSelect?.(item)}
            style={{ display: "flex", gap: 10, padding: "10px 20px", borderBottom: "1px solid var(--divider)", cursor: "pointer", alignItems: "center" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ width: 4, alignSelf: "stretch", background: item.severity.color, borderRadius: 3, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                <SeverityBadge severity={item.severity} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: tc.color, letterSpacing: "0.08em" }}>{tc.label}</span>
                {item.daysOut != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: item.daysOut <= 2 ? "var(--status-warning)" : "var(--text-muted)" }}>
                    {item.daysOut === 0 ? "TODAY" : `${item.daysOut}D`}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {(item.reasons || []).slice(0, 2).map((reason, i) => (
                  <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{reason}</span>
                ))}
              </div>
            </div>
            <ActionBadge action={item.nextAction} />
          </div>
        );
      })}
    </div>
  );
}

export function OwnerLoadBoard({ rows, onCreateActionItem }: { rows: any[]; onCreateActionItem?: () => void }) {
  if (!rows.length) {
    return (
      <EmptyStateAction
        icon="◫"
        message="No workload data — assign owners to RFIs, drawings, and tasks to populate this board"
        actions={onCreateActionItem ? [{ label: "+ Create Action Item", onClick: onCreateActionItem }] : []}
      />
    );
  }
  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px 80px", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
        <div>OWNER</div><div>TODAY</div><div>48 HRS</div><div>OVERDUE</div><div>BLOCKED</div><div>TOTAL</div>
      </div>
      {rows.map((row) => (
        <div key={row.owner} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px 80px", gap: 8, padding: "10px", borderBottom: "1px solid var(--divider)", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: row.owner === "Unassigned" ? "var(--status-error)" : "var(--text-primary)" }}>{row.owner}</div>
          <LoadCell value={row.dueToday} tone="var(--accent)" />
          <LoadCell value={row.due48} tone="var(--status-warning)" />
          <LoadCell value={row.overdue} tone="var(--status-error)" />
          <LoadCell value={row.blocked} tone="var(--status-review)" />
          <LoadCell value={row.total} tone="var(--text-secondary)" />
        </div>
      ))}
    </div>
  );
}

function LoadCell({ value, tone }: { value: number; tone: string }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: value > 0 ? tone : "var(--text-muted)" }}>
      {value}
    </div>
  );
}

// ─── AI Summary Banner ───────────────────────────────────────────────────────
interface AISummaryBannerProps {
  kpis: any;
  onClickCritical: () => void;
  onClickOverdue: () => void;
  onClickBlocksFab: () => void;
  onClickCO: () => void;
}

export function AISummaryBanner({ kpis, onClickCritical, onClickOverdue, onClickBlocksFab, onClickCO }: AISummaryBannerProps) {
  const coDisplay = kpis.coExposure >= 1000
    ? `$${(kpis.coExposure / 1000).toFixed(0)}k`
    : `$${kpis.coExposure}`;

  const linkStyle: CSSProperties = {
    cursor: "pointer",
    borderBottom: "1px dashed currentColor",
    paddingBottom: 1,
    transition: "opacity 0.15s",
  };

  return (
    <div style={{
      margin: "12px 0 8px 0",
      padding: "12px 16px",
      borderLeft: "3px solid var(--accent)",
      background: "rgba(200,155,32,0.04)",
      borderRadius: "0 var(--radius-card) var(--radius-card) 0",
      fontFamily: "var(--font-body)",
      fontSize: 13,
      color: "var(--text-secondary)",
      lineHeight: 1.55,
    }}>
      You have{" "}
      <strong
        onClick={onClickCritical}
        style={{ ...linkStyle, color: SEVERITY.CRITICAL?.color || "var(--status-error)" }}
        title="View critical items"
      >
        {kpis.critical} critical
      </strong>{" "}
      items and{" "}
      <strong
        onClick={onClickOverdue}
        style={{ ...linkStyle, color: "var(--status-error)" }}
        title="View overdue items"
      >
        {kpis.overdueAll} overdue
      </strong>.
      {kpis.blocksFab > 0 && (
        <>
          {" "}
          <strong
            onClick={onClickBlocksFab}
            style={{ ...linkStyle, color: "var(--status-review)" }}
            title="View items blocking fabrication"
          >
            {kpis.blocksFab}
          </strong>{" "}
          items are blocking fabrication.
        </>
      )}
      {" "}CO exposure:{" "}
      <strong
        onClick={onClickCO}
        style={{ ...linkStyle, color: kpis.coExposure > 10000 ? "var(--status-warning)" : "var(--text-primary)" }}
        title="View change orders"
      >
        {coDisplay}
      </strong>.
    </div>
  );
}

// ─── Health Summary Panel ────────────────────────────────────────────────────
interface HealthSummaryPanelProps {
  scoredFeed: PCCItem[];
  waitingBoard: any[];
  kpis: any;
  onClickOverdue: () => void;
  onClickBlocksFab: () => void;
  onClickSeverity: (sev: string) => void;
}

export function HealthSummaryPanel({ scoredFeed, waitingBoard, kpis, onClickOverdue, onClickBlocksFab, onClickSeverity }: HealthSummaryPanelProps) {
  const total = scoredFeed.length;
  const critCount = scoredFeed.filter((i) => i.severityKey === "CRITICAL").length;
  const highCount = scoredFeed.filter((i) => i.severityKey === "HIGH").length;
  const medCount  = scoredFeed.filter((i) => i.severityKey === "MEDIUM").length;
  const lowCount  = scoredFeed.filter((i) => i.severityKey === "LOW").length;

  // Top 3 waiting-on parties
  const topWaiting = waitingBoard.slice(0, 3);

  // Severity segments for mini stacked bar
  const segments = [
    { key: "CRITICAL", count: critCount, color: SEVERITY.CRITICAL?.color || "var(--status-error)" },
    { key: "HIGH",     count: highCount, color: SEVERITY.HIGH?.color || "var(--status-warning-bright)" },
    { key: "MEDIUM",   count: medCount,  color: SEVERITY.MEDIUM?.color || "var(--status-warning)" },
    { key: "LOW",      count: lowCount,  color: SEVERITY.LOW?.color || "#8898A8" },
  ];

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--divider)",
      borderRadius: "var(--radius-card)",
      padding: "16px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      height: "100%",
      overflow: "auto",
    }}>
      {/* Header */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
        HEALTH SUMMARY
      </div>

      {/* Total items + donut */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <DonutChart
          value={critCount + highCount}
          max={total || 1}
          size={64}
          stroke={6}
          color={SEVERITY.CRITICAL?.color || "var(--status-error)"}
          label={`${total}`}
        />
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{total}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>TOTAL OPEN ITEMS</div>
        </div>
      </div>

      {/* Severity breakdown bar */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 6 }}>SEVERITY BREAKDOWN</div>
        <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 8, background: "var(--hover-bg)" }}>
          {segments.map((seg) => (
            seg.count > 0 && (
              <div key={seg.key} style={{ width: `${(seg.count / (total || 1)) * 100}%`, background: seg.color, transition: "width 0.3s" }} title={`${seg.key}: ${seg.count}`} />
            )
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {segments.map((seg) => (
            <div
              key={seg.key}
              onClick={() => seg.count > 0 && onClickSeverity?.(seg.key)}
              style={{ display: "flex", alignItems: "center", gap: 4, cursor: seg.count > 0 ? "pointer" : "default", borderRadius: 3, padding: "2px 4px", transition: "background 0.1s" }}
              onMouseEnter={(e) => { if (seg.count > 0) e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              title={seg.count > 0 ? `Filter to ${seg.key} items` : undefined}
            >
              <div style={{ width: 6, height: 6, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                borderBottom: seg.count > 0 ? `1px dashed ${seg.color}50` : "none",
              }}>
                {seg.key}: {seg.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top waiting-on parties */}
      {topWaiting.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 6 }}>TOP WAITING ON</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topWaiting.map(({ party, count }) => (
              <div key={party} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 6 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)" }}>{party}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-warning)" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div
          onClick={() => kpis.blocksFab > 0 && onClickBlocksFab?.()}
          style={{
            padding: "8px 10px", background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 6,
            cursor: kpis.blocksFab > 0 ? "pointer" : "default", transition: "border-color 0.15s, background 0.1s",
          }}
          onMouseEnter={(e) => { if (kpis.blocksFab > 0) e.currentTarget.style.borderColor = "var(--status-review)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--divider)"; }}
          title={kpis.blocksFab > 0 ? "View items blocking fabrication" : undefined}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 2 }}>BLOCKS FAB</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800,
            color: kpis.blocksFab > 0 ? "var(--status-review)" : "var(--text-muted)",
            borderBottom: kpis.blocksFab > 0 ? "1px dashed var(--status-review)" : "none",
            display: "inline-block",
          }}>
            {kpis.blocksFab}
          </div>
          {kpis.blocksFab > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: 4, opacity: 0.6 }}>→</span>}
        </div>
        <div
          onClick={() => kpis.overdueAll > 0 && onClickOverdue?.()}
          style={{
            padding: "8px 10px", background: "var(--hover-bg)", border: "1px solid var(--divider)", borderRadius: 6,
            cursor: kpis.overdueAll > 0 ? "pointer" : "default", transition: "border-color 0.15s, background 0.1s",
          }}
          onMouseEnter={(e) => { if (kpis.overdueAll > 0) e.currentTarget.style.borderColor = "var(--status-error)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--divider)"; }}
          title={kpis.overdueAll > 0 ? "View overdue items" : undefined}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 2 }}>OVERDUE</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800,
            color: kpis.overdueAll > 0 ? "var(--status-error)" : "var(--text-muted)",
            borderBottom: kpis.overdueAll > 0 ? "1px dashed var(--status-error)" : "none",
            display: "inline-block",
          }}>
            {kpis.overdueAll}
          </div>
          {kpis.overdueAll > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: 4, opacity: 0.6 }}>→</span>}
        </div>
      </div>
    </div>
  );
}
