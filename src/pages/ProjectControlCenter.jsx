import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { useProjectContext } from "../components/shared/useProjectContext";
import {
  mapRFIsToPCCItems,
  mapDrawingsToPCCItems,
  mapWorkPackagesToPCCItems,
  mapDeliveriesToPCCItems,
  mapChangeOrdersToPCCItems,
  buildPriorityFeed,
  buildSignalKPIs,
  buildWaitingOnBoard,
  SEVERITY,
  IMPACT_TAGS,
} from "../utils/pccEngine";

// ─── Type → page routing map ──────────────────────────────────────────────────
const TYPE_PAGE_MAP = {
  RFI:         "RFIs",
  Drawing:     "Documents",
  WorkPackage: "WorkPackages",
  Delivery:    "Deliveries",
  ChangeOrder: "ChangeOrders",
};

// ─── Type icon map ────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  RFI:         { icon: "⚑",  label: "RFI",          color: "#FFB400" },
  Drawing:     { icon: "▦",  label: "DRAWING",       color: "#0EA5E9" },
  WorkPackage: { icon: "▤",  label: "WORK PKG",      color: "#E8650A" },
  Delivery:    { icon: "📦", label: "DELIVERY",      color: "#10B981" },
  ChangeOrder: { icon: "$",  label: "CHANGE ORDER",  color: "#FF9F43" },
};

// ─── Signal KPI Card ─────────────────────────────────────────────────────────
function SignalCard({ label, value, color, sub, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 100,
        padding: "10px 14px",
        background: active ? "rgba(200,155,32,0.07)" : "var(--bg-surface)",
        border: `1px solid ${active ? "rgba(200,155,32,0.30)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: color || "var(--text-primary)", lineHeight: 1, marginBottom: 2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.10em",
      padding: "2px 7px", borderRadius: 4,
      background: severity.bg, color: severity.color, border: `1px solid ${severity.border}`,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {severity.label}
    </span>
  );
}

// ─── Next-action badge ────────────────────────────────────────────────────────
function ActionBadge({ action }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.08em",
      padding: "2px 8px", borderRadius: 4,
      background: "rgba(200,155,32,0.10)", color: "var(--accent)",
      border: "1px solid rgba(200,155,32,0.22)", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      → {action}
    </span>
  );
}

// ─── Impact tag ───────────────────────────────────────────────────────────────
function ImpactTag({ tagKey }) {
  const tag = IMPACT_TAGS[tagKey];
  if (!tag) return null;
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 6, letterSpacing: "0.08em",
      padding: "1px 6px", borderRadius: 3,
      background: `${tag.color}15`, color: tag.color,
      border: `1px solid ${tag.color}30`, whiteSpace: "nowrap",
    }}>
      {tag.label}
    </span>
  );
}

// ─── Priority feed row ────────────────────────────────────────────────────────
function PriorityRow({ item, expanded, onToggle, onOpenDrawer }) {
  const tc = TYPE_CONFIG[item.type] || { icon: "◉", label: item.type, color: "var(--text-muted)" };
  const overdueTxt = item.overdueDays > 0
    ? `${item.overdueDays}d overdue`
    : item.dueSoonDays !== null
      ? `Due in ${item.dueSoonDays}d`
      : null;

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: expanded ? "rgba(255,255,255,0.015)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "4px 28px 68px 80px 1fr 100px 100px 80px 120px",
          alignItems: "center",
          height: 40,
          padding: "0 16px",
          cursor: "pointer",
          gap: 8,
        }}
      >
        {/* Severity stripe */}
        <div style={{ height: 40, width: 4, background: item.severity.color, borderRadius: 2, marginLeft: -16 }} />

        {/* Score */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: item.severity.color, textAlign: "right" }}>
          {item.score}
        </span>

        {/* Severity badge */}
        <SeverityBadge severity={item.severity} />

        {/* Type badge */}
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.09em",
          color: tc.color, background: `${tc.color}15`, border: `1px solid ${tc.color}30`,
          padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
        }}>
          {tc.icon} {tc.label}
        </span>

        {/* Title */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
            color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.title}
          </div>
          {item.subtitle && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
              {item.subtitle}
            </div>
          )}
        </div>

        {/* Timing */}
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: item.overdueDays > 0 ? "#FF7A7A" : item.dueSoonDays !== null && item.dueSoonDays <= 7 ? "#FFB400" : "rgba(160,175,210,0.38)",
          whiteSpace: "nowrap",
        }}>
          {overdueTxt || (item.due_date ? new Date(item.due_date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "—")}
        </span>

        {/* Owner */}
        <span style={{
          fontFamily: "var(--font-body)", fontSize: 11, color: item.assigned_to ? "var(--text-secondary)" : "rgba(255,100,100,0.55)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.assigned_to || "Unassigned"}
        </span>

        {/* Reasons (top 1) */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.reasons[0] || ""}
        </span>

        {/* Next action */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <ActionBadge action={item.nextAction} />
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDrawer(item); }}
            title="View details"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(160,175,210,0.50)", fontSize: 10, flexShrink: 0 }}
          >⤢</button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 16px 14px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Impact tags */}
          {(Array.isArray(item.tags) ? item.tags : []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Array.isArray(item.tags) ? item.tags : []).map((t) => <ImpactTag key={t} tagKey={t} />)}
            </div>
          )}

          {/* All reasons */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {item.reasons.map((r, i) => (
              <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4 }}>
                {r}
              </span>
            ))}
          </div>

          {/* Detail row */}
          <div style={{ display: "flex", gap: 24 }}>
            {item.project_name && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 2 }}>PROJECT</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>{item.project_name}</div>
              </div>
            )}
            {item.waiting_on && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 2 }}>WAITING ON</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#FFB400" }}>{item.waiting_on}</div>
              </div>
            )}
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 2 }}>SCORE BREAKDOWN</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: item.severity.color, fontWeight: 700 }}>
                {item.score} pts → {item.severity.label}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────
function DetailDrawer({ item, onClose, onNavigate }) {
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
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
        background: "var(--bg-surface)", borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.70)", zIndex: 51,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.09em",
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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 4 }}>
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
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>PRIORITY SCORE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 800, color: item.severity.color, lineHeight: 1 }}>{item.score}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>pts → {item.severity.label}</span>
            </div>
          </div>

          {/* Timing */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>TIMING</div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
              color: item.overdueDays > 0 ? "#FF7A7A" : item.dueSoonDays !== null && item.dueSoonDays <= 7 ? "#FFB400" : "var(--text-secondary)",
            }}>
              {overdueTxt}
            </div>
          </div>

          {/* Reasons */}
          {item.reasons.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>WHY IT'S RANKED HERE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {item.reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 8 }}>DOWNSTREAM IMPACT</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Array.isArray(item.tags) ? item.tags : []).map((t) => <ImpactTag key={t} tagKey={t} />)}
              </div>
            </div>
          )}

          {/* Ownership */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>OWNER</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: item.assigned_to ? "var(--text-secondary)" : "rgba(255,100,100,0.70)" }}>
                {item.assigned_to || "Unassigned"}
              </div>
            </div>
            {item.waiting_on && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>WAITING ON</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#FFB400" }}>{item.waiting_on}</div>
              </div>
            )}
            {item.project_name && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>PROJECT</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{item.project_name}</div>
              </div>
            )}
            {item.status && (
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 4 }}>STATUS</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)" }}>{item.status}</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — next action */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.10em", marginBottom: 8 }}>RECOMMENDED ACTION</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{
              flex: 1, background: "var(--accent)", border: "none", borderRadius: 6,
              padding: "9px 14px", color: "#07090E", fontFamily: "var(--font-mono)", fontSize: 10,
              fontWeight: 800, cursor: "pointer", letterSpacing: "0.09em", textTransform: "uppercase",
            }}>
              → {item.nextAction}
            </button>
            {onNavigate && TYPE_PAGE_MAP[item.type] && (
              <button
                onClick={() => { onNavigate(item); onClose(); }}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6, padding: "9px 14px", color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
                }}
              >
                VIEW {TYPE_CONFIG[item.type]?.label || item.type} →
              </button>
            )}
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 6, padding: "9px 14px", color: "var(--text-muted)",
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
function MorningScan({ items, onSelect }) {
  const top = items.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").slice(0, 10);
  if (!top.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "rgba(0,214,143,0.20)" }}>✓</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.12em" }}>ALL CLEAR — NO CRITICAL OR HIGH-RISK ITEMS</div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
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
              padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer", transition: "background 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {/* Index */}
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${item.severity.color}15`, border: `1px solid ${item.severity.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: item.severity.color }}>{i + 1}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <SeverityBadge severity={item.severity} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: tc.color }}>{tc.label}</span>
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                {item.reasons.slice(0, 2).map((r, ri) => (
                  <span key={ri} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{r}</span>
                ))}
              </div>
            </div>

            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <ActionBadge action={item.nextAction} />
              {item.overdueDays > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#FF7A7A", marginTop: 4 }}>{item.overdueDays}d overdue</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Waiting-On Board ─────────────────────────────────────────────────────────
function WaitingOnBoard({ board }) {
  if (!board.length) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        No items waiting on external parties
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px" }}>
      {board.map(({ party, items, count }) => (
        <div key={party} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.015)" }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{party}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#FFB400", background: "rgba(255,180,0,0.10)", border: "1px solid rgba(255,180,0,0.22)", padding: "1px 7px", borderRadius: 3 }}>
              {count} ITEMS
            </span>
          </div>
          {items.slice(0, 3).map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <SeverityBadge severity={item.severity} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.overdueDays > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#FF7A7A", whiteSpace: "nowrap" }}>
                  {item.overdueDays}d overdue
                </span>
              )}
            </div>
          ))}
          {count > 3 && (
            <div style={{ padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              +{count - 3} MORE
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Risk Watchlist (high severity items grouped by impact) ───────────────────
function RiskWatchlist({ items, onSelect }) {
  const high = items.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").slice(0, 8);
  if (!high.length) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        No high-risk items
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {high.map((item) => (
        <div key={item.id} onClick={() => onSelect?.(item)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <div style={{ width: 3, height: 28, background: item.severity.color, borderRadius: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.title}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              {item.tags.slice(0, 2).map((t) => <ImpactTag key={t} tagKey={t} />)}
            </div>
          </div>
          <ActionBadge action={item.nextAction} />
        </div>
      ))}
    </div>
  );
}

// ─── Main PCC Page ────────────────────────────────────────────────────────────
export default function ProjectControlCenter() {
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("morning");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [drawerItem, setDrawerItem] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const enabled = !!activeProject?.id;

  // ── Data fetching ──────────────────────────────────────────────
  const { data: rfis = [] }         = useQuery({ queryKey: ["pcc-rfis",         activeProject?.id], queryFn: () => base44.entities.RFI.filter({ project_id: activeProject.id }),          enabled, initialData: [] });
  const { data: drawings = [] }     = useQuery({ queryKey: ["pcc-drawings",     activeProject?.id], queryFn: () => base44.entities.Drawing.filter({ project_id: activeProject.id }),      enabled, initialData: [] });
  const { data: workPackages = [] } = useQuery({ queryKey: ["pcc-wps",          activeProject?.id], queryFn: () => base44.entities.WorkPackage.filter({ project_id: activeProject.id }), enabled, initialData: [] });
  const { data: deliveries = [] }   = useQuery({ queryKey: ["pcc-deliveries",   activeProject?.id], queryFn: () => base44.entities.Delivery.filter({ project_id: activeProject.id }),    enabled, initialData: [] });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["pcc-cos",          activeProject?.id], queryFn: () => base44.entities.ChangeOrder.filter({ project_id: activeProject.id }), enabled, initialData: [] });

  // ── Build scored feed ──────────────────────────────────────────
  const allRaw = useMemo(() => [
    ...mapRFIsToPCCItems(rfis),
    ...mapDrawingsToPCCItems(drawings),
    ...mapWorkPackagesToPCCItems(workPackages),
    ...mapDeliveriesToPCCItems(deliveries),
    ...mapChangeOrdersToPCCItems(changeOrders),
  ], [rfis, drawings, workPackages, deliveries, changeOrders]);

  const scoredFeed = useMemo(() => buildPriorityFeed(allRaw), [allRaw]);

  const filteredFeed = useMemo(() => {
    return scoredFeed.filter((item) => {
      const matchType = typeFilter === "all" || item.type === typeFilter;
      const matchSev  = severityFilter === "all" || item.severityKey === severityFilter;
      return matchType && matchSev;
    });
  }, [scoredFeed, typeFilter, severityFilter]);

  const kpis        = useMemo(() => buildSignalKPIs(scoredFeed, deliveries), [scoredFeed, deliveries]);
  const waitingBoard = useMemo(() => buildWaitingOnBoard(scoredFeed), [scoredFeed]);

  const criticalHighCount = scoredFeed.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").length;

  // ── Navigate to source record page ────────────────────────────
  const handleNavigate = (item) => {
    const page = TYPE_PAGE_MAP[item.type];
    if (page) navigate(createPageUrl(page));
  };

  // ── Export daily briefing CSV ──────────────────────────────────
  const exportBriefing = () => {
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
    const projectName = activeProject?.name || "Project";
    const rows = [
      ["Rank", "Severity", "Type", "Title", "Score", "Due Date", "Days Overdue", "Owner", "Next Action", "Impact Tags", "Reasons"],
    ];
    scoredFeed.forEach((item, idx) => {
      rows.push([
        idx + 1,
        item.severityKey,
        item.type,
        `"${(item.title || "").replace(/"/g, '""')}"`,
        item.score,
        item.due_date ? new Date(item.due_date).toLocaleDateString("en-US") : "",
        item.overdueDays > 0 ? item.overdueDays : "",
        `"${(item.assigned_to || "Unassigned").replace(/"/g, '""')}"`,
        `"${(item.nextAction || "").replace(/"/g, '""')}"`,
        `"${(item.tags || []).join(", ")}"`,
        `"${(item.reasons || []).join(" | ").replace(/"/g, '""')}"`,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PCC-Briefing_${projectName.replace(/\s+/g, "-")}_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "morning", label: "MORNING SCAN",    count: criticalHighCount },
    { id: "feed",    label: "PRIORITY FEED",   count: filteredFeed.length },
    { id: "waiting", label: "WAITING ON",      count: waitingBoard.reduce((s, g) => s + g.count, 0) },
    { id: "risk",    label: "RISK WATCHLIST",  count: criticalHighCount },
  ];

  const noProject = !activeProject;
  const isEmpty   = scoredFeed.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg-page)" }}>

      {/* ═══ COMMAND BAR ════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 56, background: "var(--bg-sidebar)", borderBottom: "1px solid var(--divider)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.06em" }}>
            PCC
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
            PROJECT CONTROL CENTER
          </span>
          {activeProject && (
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
              {activeProject.name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Last refresh */}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(160,175,210,0.30)", letterSpacing: "0.08em" }}>
            SCORED {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "0 10px", height: 28, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer", outline: "none" }}
          >
            <option value="all">All Types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "0 10px", height: 28, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer", outline: "none" }}
          >
            <option value="all">All Severity</option>
            {Object.keys(SEVERITY).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          {/* Export briefing */}
          {!isEmpty && (
            <button
              onClick={exportBriefing}
              title="Download daily briefing CSV"
              style={{
                background: "rgba(200,155,32,0.10)", border: "1px solid rgba(200,155,32,0.30)",
                borderRadius: 6, padding: "0 12px", height: 28,
                color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9,
                fontWeight: 700, cursor: "pointer", letterSpacing: "0.09em",
                whiteSpace: "nowrap",
              }}
            >
              ↓ EXPORT BRIEFING
            </button>
          )}
        </div>
      </div>

      {/* ═══ SIGNAL STRIP ══════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 8, padding: "10px 24px", background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", flexShrink: 0, flexWrap: "wrap" }}>
        <SignalCard
          label="CRITICAL"
          value={kpis.critical}
          color={kpis.critical > 0 ? SEVERITY.CRITICAL.color : "var(--text-muted)"}
          sub="items"
          onClick={() => setSeverityFilter(severityFilter === "CRITICAL" ? "all" : "CRITICAL")}
          active={severityFilter === "CRITICAL"}
        />
        <SignalCard
          label="HIGH RISK"
          value={kpis.highRisk}
          color={kpis.highRisk > 0 ? SEVERITY.HIGH.color : "var(--text-muted)"}
          sub="items"
          onClick={() => setSeverityFilter(severityFilter === "HIGH" ? "all" : "HIGH")}
          active={severityFilter === "HIGH"}
        />
        <SignalCard
          label="OVERDUE"
          value={kpis.overdueAll}
          color={kpis.overdueAll > 0 ? "#FF7A7A" : "var(--text-muted)"}
          sub="items"
        />
        <SignalCard
          label="EXTERNAL WAIT"
          value={kpis.external}
          color={kpis.external > 0 ? "#8898A8" : "var(--text-muted)"}
          sub="items"
          onClick={() => setActiveTab("waiting")}
        />
        <SignalCard
          label="BLOCKS FAB"
          value={kpis.blocksFab}
          color={kpis.blocksFab > 0 ? "#E8650A" : "var(--text-muted)"}
          sub="items"
        />
        <SignalCard
          label="BLOCKS ERECTION"
          value={kpis.blocksErec}
          color={kpis.blocksErec > 0 ? "#06B6D4" : "var(--text-muted)"}
          sub="items"
        />
        <SignalCard
          label="CO EXPOSURE"
          value={kpis.coExposure > 0 ? `$${(kpis.coExposure / 1000).toFixed(0)}k` : "$0"}
          color={kpis.coExposure > 50000 ? "#FF7A7A" : kpis.coExposure > 10000 ? "#FFB400" : "var(--text-muted)"}
          sub="open COs"
        />
      </div>

      {/* ═══ TAB BAR ═══════════════════════════════════════════════ */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 24px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", flexShrink: 0 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 8,
                background: activeTab === tab.id ? "rgba(200,155,32,0.15)" : "rgba(255,255,255,0.05)",
                color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${activeTab === tab.id ? "rgba(200,155,32,0.30)" : "rgba(255,255,255,0.08)"}`,
                padding: "0 5px", borderRadius: 3,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ CONTENT AREA ══════════════════════════════════════════ */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* No project selected */}
        {noProject && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "rgba(160,175,210,0.10)" }}>⊙</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SELECT A PROJECT TO LOAD PCC</div>
          </div>
        )}

        {/* Empty state */}
        {!noProject && isEmpty && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, color: "rgba(0,214,143,0.20)" }}>✓</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.12em" }}>NO OPEN ITEMS — PROJECT IS CLEAR</div>
          </div>
        )}

        {/* Morning Scan */}
        {!noProject && activeTab === "morning" && (
          <MorningScan items={scoredFeed} onSelect={(item) => setDrawerItem(item)} />
        )}

        {/* Priority Feed */}
        {!noProject && !isEmpty && activeTab === "feed" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "4px 28px 68px 80px 1fr 100px 100px 80px 120px",
              alignItems: "center", height: 26, padding: "0 16px", gap: 8,
              background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)",
              position: "sticky", top: 0, zIndex: 5,
            }}>
              {["", "SCORE", "SEVERITY", "TYPE", "TITLE / SET", "TIMING", "OWNER", "REASON", "NEXT ACTION"].map((h, i) => (
                <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "rgba(160,175,210,0.30)", letterSpacing: "0.12em" }}>
                  {h}
                </span>
              ))}
            </div>

            {filteredFeed.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                No items match current filters
              </div>
            ) : (
              filteredFeed.map((item) => (
                <PriorityRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onOpenDrawer={setDrawerItem}
                />
              ))
            )}
          </div>
        )}

        {/* Waiting On Board */}
        {!noProject && activeTab === "waiting" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {waitingBoard.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                No items waiting on external parties
              </div>
            ) : (
              <WaitingOnBoard board={waitingBoard} />
            )}
          </div>
        )}

        {/* Risk Watchlist */}
        {!noProject && activeTab === "risk" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <RiskWatchlist items={scoredFeed} onSelect={setDrawerItem} />
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <DetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onNavigate={handleNavigate} />
    </div>
  );
}
