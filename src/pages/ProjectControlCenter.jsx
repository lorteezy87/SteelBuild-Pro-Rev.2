import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
        background: active ? "rgba(232,101,10,0.07)" : "var(--bg-surface)",
        border: `1px solid ${active ? "rgba(232,101,10,0.30)" : "rgba(255,255,255,0.06)"}`,
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
      background: "rgba(232,101,10,0.10)", color: "var(--accent)",
      border: "1px solid rgba(232,101,10,0.22)", whiteSpace: "nowrap", flexShrink: 0,
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
function PriorityRow({ item, expanded, onToggle }) {
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
        <ActionBadge action={item.nextAction} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "10px 16px 14px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Impact tags */}
          {item.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {item.tags.map((t) => <ImpactTag key={t} tagKey={t} />)}
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
function RiskWatchlist({ items }) {
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
        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
  const [activeTab, setActiveTab] = useState("feed");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
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

  const tabs = [
    { id: "feed",    label: "PRIORITY FEED",   count: filteredFeed.length },
    { id: "waiting", label: "WAITING ON",      count: waitingBoard.reduce((s, g) => s + g.count, 0) },
    { id: "risk",    label: "RISK WATCHLIST",  count: scoredFeed.filter((i) => i.severityKey === "CRITICAL" || i.severityKey === "HIGH").length },
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
                background: activeTab === tab.id ? "rgba(232,101,10,0.15)" : "rgba(255,255,255,0.05)",
                color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
                border: `1px solid ${activeTab === tab.id ? "rgba(232,101,10,0.30)" : "rgba(255,255,255,0.08)"}`,
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
            <RiskWatchlist items={scoredFeed} />
          </div>
        )}
      </div>
    </div>
  );
}
