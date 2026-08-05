import React from "react";
import {
  AlertTriangle, Check, CheckCircle, ChevronDown, ChevronRight,
  ClipboardList, Download, Lock, Pencil, Square, Trash2, Upload, CheckSquare,
} from "lucide-react";
import { Button as ButtonBase } from "@/components/ui/button";
const Button = ButtonBase as any;
import { PTD } from "@/components/shared/PhoenixTable";
import { formatCurrency, formatPercent } from "@/components/shared/formatters";
import {
  SOV_COL_COUNT,
  SOV_STATUS_STYLE,
  miniBarColor,
  tdTotalStyle,
  type SovLineCalc,
  type SovTotals,
} from "./format";

/* ═══════════════════════════════════════════════════════════════════
   Progress Visualization — slim horizontal bar
   ═══════════════════════════════════════════════════════════════════ */
export function MiniBar({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.min(Math.max((ratio || 0) * 100, 0), 120);
  const displayPct = Math.min(pct, 100);
  const barColor = miniBarColor(pct);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, minWidth: 70 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
        {label}
      </span>
      <div style={{
        width: "100%", height: 4, borderRadius: 2,
        background: "var(--bg-surface-low)", overflow: "hidden",
      }}>
        <div style={{
          width: `${displayPct}%`, height: "100%", borderRadius: 2,
          background: barColor, transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Status Badges — high-visibility colored pills
   ═══════════════════════════════════════════════════════════════════ */
export function SOVStatusPill({ status }: { status?: string | null }) {
  const s = SOV_STATUS_STYLE[status || ""] || {
    bg: "var(--hover-bg)", color: "var(--text-muted)",
    border: "var(--border-default)",
  };
  const Icon = status === "Certified" ? Lock : status === "Paid" ? CheckCircle : null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 9999,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
      whiteSpace: "nowrap", fontFamily: "var(--font-body)",
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {Icon && <Icon style={{ width: 12, height: 12 }} />}
      {status || "\u2014"}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Over-billing Protection — badge component
   ═══════════════════════════════════════════════════════════════════ */
export function OverBilledBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 6px", borderRadius: 4, marginLeft: 4,
      fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
      background: "var(--danger-muted)", color: "var(--status-error)",
      border: "1px solid var(--danger-border)",
      fontFamily: "var(--font-mono)", textTransform: "uppercase",
    }}>
      <AlertTriangle style={{ width: 10, height: 10 }} />
      OVER-BILLED
    </span>
  );
}

export interface SovRowProps {
  line: Record<string, unknown>;
  calc: SovLineCalc;
  sovActual: number;
  variance: number;
  isHovered: boolean;
  effectiveRetainage: number | null;
  selected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (line: Record<string, unknown>) => void;
  onDelete: (line: Record<string, unknown>) => void;
  onFillComplete: (id: string) => void;
}

export function SovRow({
  line: s,
  calc: c,
  sovActual,
  variance,
  isHovered,
  effectiveRetainage,
  selected,
  canEdit,
  canDelete,
  onToggleSelect,
  onEdit,
  onDelete,
  onFillComplete,
}: SovRowProps) {
  const sv = Number(s.scheduled_value) || 0;
  const curPct = Number(s.current_percent_complete) || 0;
  const toDateRatio = sv > 0 ? c.toDate / sv : 0;

  return (
    <tr
      onClick={() => onEdit(s)}
      style={{
        borderBottom: "1px solid var(--divider)",
        background: c.overBilled ? "var(--danger-muted)" : (isHovered ? "var(--bg-row-hover)" : "transparent"),
        borderLeft: c.overBilled ? "4px solid var(--status-error)" : "4px solid transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      <td
        style={{ padding: "9px 14px", textAlign: "center", cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(s.id as string); }}
      >
        {selected
          ? <CheckSquare size={12} color="var(--accent)" />
          : <Square size={12} color="var(--text-muted)" />}
      </td>
      <PTD mono accent>{String(s.line_item_number ?? "")}</PTD>
      <PTD style={{ maxWidth: 160 }}>{String(s.description ?? "")}</PTD>
      <PTD muted>{String(s.project_name ?? "")}</PTD>
      <PTD right mono>{formatCurrency(s.scheduled_value)}</PTD>
      <PTD right mono>{formatPercent(s.previous_percent_complete)}</PTD>
      <PTD right mono>
        <MiniBar ratio={curPct / 100} label={formatPercent(curPct)} />
      </PTD>
      <PTD right mono>{formatCurrency(c.thisPeriod)}</PTD>
      <PTD right mono>
        <MiniBar ratio={toDateRatio} label={formatCurrency(c.toDate)} />
      </PTD>
      <PTD right mono style={{ color: sovActual > c.toDate ? "var(--status-error)" : "var(--status-success)" }}>
        {formatCurrency(sovActual)}
      </PTD>
      <PTD right mono style={{ color: variance < 0 ? "var(--status-error)" : "var(--status-success)", fontWeight: 700 }}>
        {formatCurrency(variance)}
      </PTD>
      <PTD right mono style={c.overBilled ? { color: "var(--status-error)", fontWeight: 700, background: "rgba(239,68,68,0.12)", borderRadius: 4 } : {}}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end" }}>
          {formatCurrency(c.balance)}
          {c.overBilled && <OverBilledBadge />}
        </span>
      </PTD>
      <PTD right mono style={{ color: "var(--status-warning)" }}>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span>{formatCurrency(c.retAmt)}</span>
          {effectiveRetainage != null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
              @{c.retPct}%
            </span>
          )}
        </span>
      </PTD>
      <PTD right mono bold style={{ color: "var(--accent)" }}>{formatCurrency(c.netToDate)}</PTD>
      <PTD><SOVStatusPill status={s.status as string} /></PTD>
      <PTD>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }} onClick={e => e.stopPropagation()}>
          {curPct < 100 && isHovered && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              title="Fill to 100%"
              onClick={() => onFillComplete(s.id as string)}
              style={{ color: "var(--status-success)" }}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onEdit(s)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7"
              style={{ color: "var(--status-error)" }}
              onClick={() => onDelete(s)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </PTD>
    </tr>
  );
}

export function SovTotalsRow({ totals }: { totals: SovTotals }) {
  return (
    <tr style={{ background: "var(--bg-surface-low)", borderTop: "2px solid var(--divider)" }}>
      <td colSpan={4} style={{
        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em",
        color: "var(--accent)", fontWeight: 700, padding: "8px 12px",
      }}>TOTALS</td>
      <td style={tdTotalStyle()}>{formatCurrency(totals.scheduled)}</td>
      <td colSpan={2} />
      <td style={tdTotalStyle()}>{formatCurrency(totals.thisPeriod)}</td>
      <td style={tdTotalStyle()}>{formatCurrency(totals.toDate)}</td>
      <td colSpan={2} />
      <td style={tdTotalStyle()}>{formatCurrency(totals.balance)}</td>
      <td style={tdTotalStyle("var(--status-warning)")}>{formatCurrency(totals.retainage)}</td>
      <td style={tdTotalStyle("var(--accent)")}>{formatCurrency(totals.net)}</td>
      <td colSpan={2} />
    </tr>
  );
}

export interface SovPhaseGroup {
  label: string;
  items: Record<string, unknown>[];
  sub: { scheduled: number; toDate: number; balance: number };
}

export function SovGroupedBody({
  groups,
  collapsedGroups,
  onToggleGroup,
  renderRow,
}: {
  groups: SovPhaseGroup[];
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (label: string) => void;
  renderRow: (line: Record<string, unknown>) => React.ReactNode;
}) {
  return groups.map(group => {
    const isCollapsed = !!collapsedGroups[group.label];
    return (
      <React.Fragment key={group.label}>
        <tr
          style={{
            background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)",
            borderTop: "2px solid var(--divider)", cursor: "pointer",
          }}
          onClick={() => onToggleGroup(group.label)}
        >
          <td colSpan={SOV_COL_COUNT} style={{
            padding: "8px 12px", fontFamily: "var(--font-body)",
            fontSize: 12, fontWeight: 700, color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isCollapsed
                ? <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
                : <ChevronDown style={{ width: 14, height: 14, color: "var(--text-muted)" }} />
              }
              <span style={{ textTransform: "uppercase" }}>{group.label}</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                color: "var(--accent)", borderRadius: 4, padding: "1px 6px",
              }}>{group.items.length}</span>
              <span style={{
                marginLeft: "auto", fontFamily: "var(--font-mono)",
                fontSize: 10, color: "var(--text-muted)",
              }}>
                Sched: {formatCurrency(group.sub.scheduled)}
                {" | "}To Date: {formatCurrency(group.sub.toDate)}
                {" | "}Bal: {formatCurrency(group.sub.balance)}
              </span>
            </div>
          </td>
        </tr>
        {!isCollapsed && group.items.map(s => renderRow(s))}
      </React.Fragment>
    );
  });
}

export function SovEmptyState({
  canCreate,
  importing,
  hasProject,
  onCreate,
  onDownloadTemplate,
  onImport,
}: {
  canCreate: boolean;
  importing: boolean;
  hasProject: boolean;
  onCreate: () => void;
  onDownloadTemplate: () => void;
  onImport: () => void;
}) {
  return (
    <tr>
      <td colSpan={SOV_COL_COUNT}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "64px 24px", textAlign: "center",
        }}>
          <ClipboardList style={{
            width: 56, height: 56, color: "var(--text-disabled)",
            marginBottom: 16, strokeWidth: 1.2,
          }} />
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700,
            color: "var(--text-primary)", marginBottom: 6,
          }}>
            No Schedule of Values yet
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)",
            maxWidth: 360, marginBottom: 20, lineHeight: 1.5,
          }}>
            Add your first line item to start tracking progress billing
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {canCreate && (
              <Button
                size="sm"
                onClick={onCreate}
                style={{ background: "var(--accent)", color: "var(--bg-base)", border: "none", fontWeight: 700 }}
              >
                + Add First Line Item
              </Button>
            )}
            <Button
              variant="outline" size="sm"
              onClick={onDownloadTemplate}
              style={{ fontWeight: 600 }}
              title="Download blank CSV template"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download Template
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={onImport}
              disabled={importing || !hasProject}
              style={{ fontWeight: 600 }}
              title="Upload filled template"
            >
              <Upload className="w-3.5 h-3.5 mr-1" />
              {importing ? "Importing…" : "Import CSV"}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function SovNoProjectGuard() {
  return (
    <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#128202;</div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700,
        color: "var(--text-disabled)", marginBottom: 6,
      }}>
        Select a project to view SOV
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
        Use the project selector in the top right.
      </div>
    </div>
  );
}
