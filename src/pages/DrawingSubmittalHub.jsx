/**
 * DrawingSubmittalHub.jsx — Unified Drawings & Submittals command center.
 *
 * Three tabs:
 *   1. Drawing Register   — existing Drawings.jsx (embedded)
 *   2. Submittal Register  — existing Submittals.jsx (embedded)
 *   3. Approval Matrix     — cross-reference: drawing sets vs submittal status
 *
 * This is a thin orchestrator. The existing pages render inside tab panels
 * and keep all their internal state / queries. The hub adds:
 *   - Unified KPI strip spanning both domains
 *   - Shared CommandBar with tab navigation
 *   - Approval Matrix (new view)
 */

import React, { useState, useMemo, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile } from "@/components/design-system";
import { computeFabReady } from "@/lib/submittalAnalytics";
import CycleTimeCard from "@/components/submittals/CycleTimeCard";
import AgingReportTable from "@/components/submittals/AgingReportTable";

// Lazy-load the existing pages as tab content
const DrawingsPage = lazy(() => import("@/pages/Drawings"));
const SubmittalsPage = lazy(() => import("@/pages/Submittals"));

// ── Design-system tokens ──────────────────────────────────────────────────
// Use the SAME CSS custom-property names as the rest of the app (Submittals,
// Drawings, RFIs, etc.). Previous version referenced nonexistent vars
// (--surface-0, --border) with dark hardcoded fallbacks, which made the
// Approval Matrix unreadable.
const accent      = "var(--accent)";
const surface0    = "var(--bg-surface)";
const surface1    = "var(--bg-surface-low)";
const surface2    = "var(--bg-surface-high)";
const border      = "var(--border-default)";
const textPrimary = "var(--text-primary)";
const textMuted   = "var(--text-muted)";
const mono        = "var(--font-mono)";
const success     = "var(--status-success)";
const warning     = "var(--status-warning)";
const error       = "var(--status-error)";

const TABS = [
  { key: "overview",   label: "Triage Board" },
  { key: "drawings",   label: "Drawing Register" },
  { key: "submittals", label: "Submittal Register" },
  { key: "matrix",     label: "Approval Matrix" },
];

// ── Status colors for matrix ───────────────────────────────────────────────
const STATUS_COLORS = {
  Draft:                 "#64748b",
  Submitted:             "#3b82f6",
  "Under Review":        "#0d9488",
  Approved:              "#10b981",
  "Approved as Noted":   "#84cc16",
  "Revise and Resubmit": "#f59e0b",
  Rejected:              "#ef4444",
  "Released for Fabrication": "#0ea5e9",
  Void:                  "#6b7280",
};

const CLOSED_SUBMITTAL_STATUSES = new Set([
  "Approved",
  "Approved as Noted",
  "Released for Fabrication",
  "Void",
]);

const ACTION_STATUSES = new Set([
  "Rejected",
  "Revise and Resubmit",
]);

function toLocalDay(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysUntil(input) {
  const due = toLocalDay(input);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function dueInfo(input, closed = false) {
  if (closed) {
    return { label: "Closed", days: null, overdue: false, dueSoon: false, tone: success, sort: 99999 };
  }
  const days = daysUntil(input);
  if (days === null) {
    return { label: "No date", days: null, overdue: false, dueSoon: false, tone: textMuted, sort: 99998 };
  }
  if (days < 0) {
    return { label: `${Math.abs(days)}d late`, days, overdue: true, dueSoon: false, tone: error, sort: days };
  }
  if (days === 0) {
    return { label: "Due today", days, overdue: false, dueSoon: true, tone: warning, sort: 0 };
  }
  if (days <= 7) {
    return { label: `${days}d left`, days, overdue: false, dueSoon: true, tone: warning, sort: days };
  }
  return { label: fmtDate(input), days, overdue: false, dueSoon: false, tone: textMuted, sort: days };
}

function getSubmittalDueDate(submittal) {
  return submittal?.required_date || submittal?.due_date || submittal?.date_required || null;
}

function getDrawingDueDate(drawing) {
  return drawing?.due_date || drawing?.required_date || drawing?.target_date || null;
}

function isClosedSubmittal(submittal) {
  return CLOSED_SUBMITTAL_STATUSES.has(submittal?.status);
}

function isClosedDrawing(drawing) {
  return drawing?.stage === "Released" || drawing?.set_approval_status === "approved";
}

function itemUrgency(a, b) {
  const rank = (item) => {
    if (item.due.overdue) return 0;
    if (item.due.dueSoon) return 1;
    if (item.needsAction) return 2;
    if (!item.dueDate) return 3;
    return 4;
  };
  return rank(a) - rank(b) || a.due.sort - b.due.sort || a.title.localeCompare(b.title);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DrawingSubmittalHub() {
  const { activeProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = activeProject?.id;
  const projectName = activeProject?.name || activeProject?.project_number || "";

  // Tab state from URL (persistent across navigation)
  const tabParam = searchParams.get("hub_tab") || "overview";
  const activeTab = TABS.find((t) => t.key === tabParam) ? tabParam : "overview";
  const setActiveTab = (key) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("hub_tab", key);
      return next;
    }, { replace: true });
  };

  // ── Data for KPI strip & matrix ────────────────────────────────────────
  const { drawings, isLoading: drawingsLoading } = useDrawings(projectId);
  const {
    submittals, kpis, _byDrawingSet, roundsBySubmittal,
    isLoading: submittalsLoading,
  } = useSubmittals(projectId);

  // Drawing sets (for matrix)
  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => base44.entities.DrawingSet.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // ── Drawing KPIs ───────────────────────────────────────────────────────
  const drawingKpis = useMemo(() => {
    const active = drawings.filter((d) => !d.is_superseded && !d.is_deleted);
    const released = active.filter((d) => d.stage === "Released").length;
    // "In review" = active workflow stages (post-077): IFA / OFA / BFA / OFS / IFC.
    const inReview = active.filter((d) =>
      ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage)
    ).length;
    const overdueDrawings = active.filter((d) => {
      if (!d.due_date || d.stage === "Released") return false;
      return new Date(d.due_date) < new Date();
    }).length;
    return {
      totalSheets: active.length,
      released,
      inReview,
      overdue: overdueDrawings,
    };
  }, [drawings]);

  // ── Fab-Ready KPI ──────────────────────────────────────────────────────
  const fabReady = useMemo(
    () => computeFabReady(drawings, submittals),
    [drawings, submittals]
  );

  const isLoading = drawingsLoading || submittalsLoading;

  const triage = useMemo(() => {
    const activeDrawings = drawings.filter((d) => !d.is_deleted && !d.is_superseded);
    const activeSubmittals = submittals.filter((s) => !s.is_deleted);

    const drawingItems = activeDrawings.map((drawing) => {
      const closed = isClosedDrawing(drawing);
      const dueDate = getDrawingDueDate(drawing);
      const title = [drawing.sheet_number, drawing.title || drawing.name]
        .filter(Boolean)
        .join(" - ") || drawing.drawing_set_name || "Untitled drawing";
      const needsAction = ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage);
      return {
        id: `drawing-${drawing.id}`,
        kind: "Drawing",
        title,
        group: drawing.drawing_set_name || drawing.set_name || "Ungrouped set",
        status: drawing.stage || drawing.set_approval_status || "No stage",
        owner: drawing.ball_in_court || drawing.assigned_to || drawing.reviewer || "Unassigned",
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "drawings",
      };
    });

    const submittalItems = activeSubmittals.map((submittal) => {
      const closed = isClosedSubmittal(submittal);
      const dueDate = getSubmittalDueDate(submittal);
      const title = [submittal.submittal_number, submittal.title || submittal.description]
        .filter(Boolean)
        .join(" - ") || "Untitled submittal";
      const setCount = Array.isArray(submittal.drawing_set_ids) ? submittal.drawing_set_ids.length : 0;
      const needsAction = ACTION_STATUSES.has(submittal.status);
      return {
        id: `submittal-${submittal.id}`,
        kind: "Submittal",
        title,
        group: submittal.drawing_set_name || (setCount ? `${setCount} linked set${setCount === 1 ? "" : "s"}` : "No linked set"),
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "submittals",
      };
    });

    const openItems = [...drawingItems, ...submittalItems].filter((item) => !item.closed);
    const overdue = openItems.filter((item) => item.due.overdue).sort(itemUrgency);
    const dueSoon = openItems
      .filter((item) => item.due.dueSoon)
      .sort(itemUrgency);
    const needsAction = openItems
      .filter((item) => item.needsAction)
      .sort(itemUrgency);
    const noDate = openItems
      .filter((item) => !item.dueDate)
      .sort(itemUrgency);

    const pipelineCounts = openItems.reduce((acc, item) => {
      const key = item.status || "No status";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      drawingItems,
      submittalItems,
      openItems: openItems.sort(itemUrgency),
      overdue,
      dueSoon,
      needsAction,
      noDate,
      pipelineCounts,
      overdueDrawings: overdue.filter((item) => item.kind === "Drawing").length,
      overdueSubmittals: overdue.filter((item) => item.kind === "Submittal").length,
      fabReady,
    };
  }, [drawings, submittals, fabReady]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: surface0 }}>
      {/* ── Command Bar ──────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={projectName}
        title="Drawings & Submittals"
        count={drawingKpis.totalSheets + kpis.total}
        unit="items"
        subtitle="Unified drawing register, submittal tracking, and approval pipeline"
      />

      {/* ── KPI Strip ────────────────────────────────────────────────── */}
      <div className="sbd-mesh-bg" style={{
        display: "flex", gap: 8, padding: "8px 20px", flexWrap: "wrap",
        borderBottom: `1px solid ${border}`,
        background: surface1,
      }}>
        {/* Drawing KPIs */}
        <KpiTile label="Total Sheets"    value={drawingKpis.totalSheets} color={accent} loading={isLoading} />
        <KpiTile label="Released"        value={drawingKpis.released}    color={success} loading={isLoading} />
        <KpiTile label="In Review"       value={drawingKpis.inReview}    color={warning} loading={isLoading} />

        <div style={{ width: 1, background: border, margin: "4px 8px" }} />

        {/* Submittal KPIs */}
        <KpiTile label="Submittals"      value={kpis.total}    color={accent} loading={isLoading} />
        <KpiTile label="Pending"         value={kpis.pending}  color={warning} loading={isLoading} />
        <KpiTile label="Approved"        value={kpis.approved} color={success} loading={isLoading} />
        <KpiTile label="Needs Action"    value={kpis.rejected} color={error} loading={isLoading} />
        <KpiTile label="Overdue"         value={kpis.overdue}  color={error} loading={isLoading} />

        <div style={{ width: 1, background: border, margin: "4px 8px" }} />

        {/* Fab-Ready KPI: numerator/denominator (percent%) */}
        <KpiTile
          label="Fab-Ready"
          value={`${fabReady.numerator} / ${fabReady.denominator}`}
          sub={`${fabReady.percent}%`}
          color={success}
          loading={isLoading}
        />
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, padding: "0 20px",
        borderBottom: `1px solid ${border}`,
        background: surface1,
      }}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 20px",
                fontFamily: mono,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: isActive ? textPrimary : textMuted,
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${accent}` : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingSkeleton />}>
            {activeTab === "overview" && (
              <TriageBoard
                triage={triage}
                isLoading={isLoading}
                onOpenTab={setActiveTab}
              />
            )}
            {activeTab === "drawings" && <DrawingsPage />}
            {activeTab === "submittals" && <SubmittalsPage />}
            {activeTab === "matrix" && (
              <ApprovalMatrix
                drawingSets={drawingSets}
                submittals={submittals}
                roundsBySubmittal={roundsBySubmittal}
                isLoading={isLoading}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Matrix — rows: drawing sets, columns show linked submittal status
// ─────────────────────────────────────────────────────────────────────────────

function TriageBoard({ triage, isLoading, onOpenTab }) {
  if (isLoading) return <LoadingSkeleton />;

  const oldest = triage.overdue[0];
  const topStatuses = Object.entries(triage.pipelineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="sbd-card-strong" style={{
        padding: 18,
        borderRadius: 18,
        border: `1px solid ${triage.overdue.length ? error : border}`,
        background: triage.overdue.length
          ? "linear-gradient(135deg, color-mix(in srgb, var(--status-error) 18%, var(--bg-surface) 82%), var(--bg-surface-low))"
          : surface1,
        boxShadow: triage.overdue.length ? "0 0 32px rgba(239, 68, 68, 0.14)" : "none",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: triage.overdue.length ? error : success,
              fontWeight: 800,
              marginBottom: 8,
            }}>
              {triage.overdue.length ? "Immediate attention required" : "No overdue drawing or submittal items"}
            </div>
            <h2 style={{ margin: 0, color: textPrimary, fontSize: 24, lineHeight: 1.15 }}>
              {triage.overdue.length
                ? `${triage.overdue.length} overdue item${triage.overdue.length === 1 ? "" : "s"} blocking clean handoff`
                : "Drawing and submittal pipeline is current"}
            </h2>
            <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", maxWidth: 920, lineHeight: 1.5 }}>
              {oldest
                ? `${triage.overdueDrawings} drawings and ${triage.overdueSubmittals} submittals are past due. Oldest: ${oldest.title} (${oldest.due.label}, due ${fmtDate(oldest.dueDate)}).`
                : "Use the board below to watch due-this-week work, missing due dates, and resubmittal/rejection items before they become schedule blockers."}
            </p>
          </div>
          <button
            type="button"
            className="sbd-btn-primary"
            onClick={() => onOpenTab(triage.overdueSubmittals >= triage.overdueDrawings ? "submittals" : "drawings")}
            style={{ minWidth: 156 }}
          >
            Open Register
          </button>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <TriageMetric label="Overdue" value={triage.overdue.length} color={error} sub="Past required date" />
        <TriageMetric label="Due This Week" value={triage.dueSoon.length} color={warning} sub="Next 7 days" />
        <TriageMetric label="Needs Action" value={triage.needsAction.length} color={error} sub="Rejected / resubmit" />
        <TriageMetric label="No Due Date" value={triage.noDate.length} color={textMuted} sub="Needs cleanup" />
        <TriageMetric label="Fab Ready" value={`${triage.fabReady.numerator}/${triage.fabReady.denominator}`} color={success} sub={`${triage.fabReady.percent}% released`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Overdue Now"
          subtitle="Sorted by most urgent drawing/submittal due date."
          items={triage.overdue.slice(0, 10)}
          empty="Nothing is overdue."
          onOpenTab={onOpenTab}
        />
        <TriageList
          title="Due Next 7 Days"
          subtitle="Upcoming required dates before they become late."
          items={triage.dueSoon.slice(0, 8)}
          empty="No drawing or submittal due dates in the next week."
          onOpenTab={onOpenTab}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Needs Action"
          subtitle="Rejected or revise-and-resubmit work that needs ownership."
          items={triage.needsAction.slice(0, 8)}
          empty="No rejected or resubmit items."
          onOpenTab={onOpenTab}
        />
        <div className="sbd-card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>Open Pipeline</h3>
              <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
                Current open status distribution.
              </p>
            </div>
            <button type="button" className="sbd-btn-ghost" onClick={() => onOpenTab("matrix")}>
              Matrix
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topStatuses.length === 0 ? (
              <EmptyState text="No open items to summarize." />
            ) : (
              topStatuses.map(([status, count]) => (
                <PipelineBar key={status} status={status} count={count} total={triage.openItems.length} />
              ))
            )}
          </div>
        </div>
      </div>

      {triage.noDate.length > 0 && (
        <TriageList
          title="Missing Due Dates"
          subtitle="These records cannot be reliably managed until a due/required date is assigned."
          items={triage.noDate.slice(0, 10)}
          empty="All open items have due dates."
          onOpenTab={onOpenTab}
          compact
        />
      )}
    </div>
  );
}

function TriageMetric({ label, value, sub, color }) {
  return (
    <div className="sbd-card" style={{ padding: "14px 16px", borderRadius: 14, borderTop: `2px solid ${color}` }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, fontWeight: 800 }}>
        {label}
      </div>
      <div className="sbd-num" style={{ color, fontFamily: mono, fontSize: 30, lineHeight: 1, fontWeight: 800, marginTop: 10 }}>
        {value}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function TriageList({ title, subtitle, items, empty, onOpenTab, compact = false }) {
  return (
    <section className="sbd-card" style={{ padding: compact ? 14 : 16, borderRadius: 14, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>{title}</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>{subtitle}</p>
        </div>
        <span className="sbd-badge-info">{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <TriageItemRow key={item.id} item={item} onOpen={() => onOpenTab(item.routeTab)} />
          ))
        )}
      </div>
    </section>
  );
}

function TriageItemRow({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "92px minmax(220px, 1fr) 110px 130px",
        gap: 12,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${item.due.overdue ? "color-mix(in srgb, var(--status-error) 60%, transparent)" : border}`,
        background: item.due.overdue
          ? "color-mix(in srgb, var(--status-error) 10%, var(--bg-surface-low) 90%)"
          : "var(--bg-surface-low)",
        color: textPrimary,
        cursor: "pointer",
      }}
    >
      <div>
        <div style={{ fontFamily: mono, fontSize: 9, color: item.kind === "Drawing" ? accent : success, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>
          {item.kind}
        </div>
        <DueChip info={item.due} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: textPrimary, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.title}
        </div>
        <div style={{ color: textMuted, fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.group} - {item.status}
        </div>
      </div>
      <div style={{ color: textMuted, fontFamily: mono, fontSize: 11 }}>
        Due {fmtDate(item.dueDate)}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Owner: {item.owner}
      </div>
    </button>
  );
}

function PipelineBar({ status, count, total }) {
  const color = STATUS_COLORS[status] || accent;
  const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: mono, fontSize: 11, color: textPrimary, marginBottom: 5 }}>
        <span>{status}</span>
        <span className="sbd-num">{count}</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: surface2, overflow: "hidden", border: `1px solid ${border}` }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: 14, color: textMuted, border: `1px dashed ${border}`, borderRadius: 10, fontSize: 13 }}>
      {text}
    </div>
  );
}

function DueChip({ info }) {
  return (
    <span style={{
      display: "inline-block",
      marginTop: 6,
      padding: "2px 6px",
      borderRadius: 5,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: info.tone,
      background: `color-mix(in srgb, ${info.tone} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${info.tone} 44%, transparent)`,
      whiteSpace: "nowrap",
    }}>
      {info.label}
    </span>
  );
}

function ApprovalMatrix({ drawingSets, submittals, roundsBySubmittal, isLoading }) {
  const [search, setSearch] = useState("");

  // Build matrix: for each drawing set, find all submittals that reference it
  const matrixRows = useMemo(() => {
    const activeSubmittals = submittals.filter((s) => !s.is_deleted);
    const setSubmittalMap = {};

    for (const sub of activeSubmittals) {
      const setIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
      for (const sid of setIds) {
        if (!setSubmittalMap[sid]) setSubmittalMap[sid] = [];
        setSubmittalMap[sid].push(sub);
      }
    }

    const activeSets = drawingSets
      .filter((s) => !s.is_deleted)
      .map((set) => {
        const linked = setSubmittalMap[set.id] || [];
        const latestSubmittal = linked.slice().sort(
          (a, b) => (b.round_number || 1) - (a.round_number || 1)
        )[0] || null;
        const due = dueInfo(getSubmittalDueDate(latestSubmittal), latestSubmittal ? isClosedSubmittal(latestSubmittal) : false);
        return {
          ...set,
          submittals: linked,
          latestSubmittal,
          due,
        };
      })
      .filter((set) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (set.set_name || "").toLowerCase().includes(q) ||
          (set.discipline || "").toLowerCase().includes(q) ||
          set.submittals.some((s) => (s.submittal_number || "").toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (!a.latestSubmittal && b.latestSubmittal) return 1;
        if (a.latestSubmittal && !b.latestSubmittal) return -1;
        return a.due.sort - b.due.sort || (a.set_name || "").localeCompare(b.set_name || "");
      });

    return activeSets;
  }, [drawingSets, submittals, search]);

  // Summary counts
  const summary = useMemo(() => {
    let noSubmittal = 0, pending = 0, approved = 0, rejected = 0, overdue = 0, dueSoon = 0;
    for (const row of matrixRows) {
      if (!row.latestSubmittal) { noSubmittal++; continue; }
      const st = row.latestSubmittal.status;
      if (st === "Approved" || st === "Approved as Noted" || st === "Released for Fabrication") approved++;
      else if (st === "Rejected" || st === "Revise and Resubmit") rejected++;
      else pending++;
      if (row.due.overdue) overdue++;
      if (row.due.dueSoon) dueSoon++;
    }
    return { noSubmittal, pending, approved, rejected, overdue, dueSoon, total: matrixRows.length };
  }, [matrixRows]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div style={{ padding: 20 }}>
      {/* ── Analytics (cycle-time + aging) ───────────────────────── */}
      <CycleTimeCard submittals={submittals} isLoading={isLoading} />
      <AgingReportTable submittals={submittals} isLoading={isLoading} />

      {/* ── Summary Bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap",
        alignItems: "center",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            className="sbd-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets, submittals..."
            style={{
              width: "100%", maxWidth: 360,
              padding: "8px 12px",
              background: surface2, color: textPrimary,
              border: `1px solid ${border}`, borderRadius: 4,
              fontFamily: mono, fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        <SummaryChip label="Total Sets" value={summary.total} color={accent} />
        <SummaryChip label="No Submittal" value={summary.noSubmittal} color={textMuted} />
        <SummaryChip label="Overdue" value={summary.overdue} color={error} />
        <SummaryChip label="Due Soon" value={summary.dueSoon} color={warning} />
        <SummaryChip label="Pending" value={summary.pending} color={warning} />
        <SummaryChip label="Approved" value={summary.approved} color={success} />
        <SummaryChip label="Needs Action" value={summary.rejected} color={error} />
      </div>

      {/* ── Matrix Table ─────────────────────────────────────────── */}
      <div className="sbd-card" style={{
        borderRadius: 6, border: `1px solid ${border}`,
        overflow: "hidden",
        padding: 0,
      }}>
        <table className="sbd-table" style={{
          width: "100%", borderCollapse: "collapse",
          fontFamily: mono, fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: surface2 }}>
              <Th>Drawing Set</Th>
              <Th>Discipline</Th>
              <Th style={{ textAlign: "center" }}>Sheets</Th>
              <Th>Submittal #</Th>
              <Th>Status</Th>
              <Th>Due Status</Th>
              <Th style={{ textAlign: "center" }}>Round</Th>
              <Th>BIC</Th>
              <Th>Submitted</Th>
              <Th>Required</Th>
              <Th>Returned</Th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{
                  padding: 40, textAlign: "center", color: textMuted,
                }}>
                  {search ? "No matching drawing sets." : "No drawing sets yet."}
                </td>
              </tr>
            ) : (
              matrixRows.map((row) => (
                <MatrixRow
                  key={row.id}
                  drawingSet={row}
                  sub={row.latestSubmittal}
                  due={row.due}
                  allSubmittals={row.submittals}
                  roundsBySubmittal={roundsBySubmittal}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Matrix table row ──────────────────────────────────────────────────────

function MatrixRow({ drawingSet, sub, due, allSubmittals, roundsBySubmittal }) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = allSubmittals.length > 1;
  const overdueStyle = due?.overdue ? { color: error, fontWeight: 700 } : {};

  return (
    <>
      <tr
        onClick={hasMultiple ? () => setExpanded(!expanded) : undefined}
        style={{
          borderBottom: `1px solid ${border}`,
          cursor: hasMultiple ? "pointer" : "default",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = surface2)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Td style={{ fontWeight: 600 }}>
          {hasMultiple && (
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>
              {expanded ? "▾" : "▸"}
            </span>
          )}
          {drawingSet.set_name || "—"}
        </Td>
        <Td style={{ color: textMuted }}>{drawingSet.discipline || "—"}</Td>
        <Td style={{ textAlign: "center" }}>{drawingSet.sheet_count || 0}</Td>
        {sub ? (
          <>
            <Td style={{ color: accent }}>{sub.submittal_number}</Td>
            <Td>
              <StatusChip status={sub.status} />
            </Td>
            <Td>
              <DueChip info={due} />
            </Td>
            <Td style={{ textAlign: "center" }}>
              {sub.round_number > 1 && (
                <span style={{
                  background: warning, color: "#000",
                  padding: "1px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700,
                }}>
                  R{sub.round_number}
                </span>
              )}
              {sub.round_number <= 1 && "1"}
            </Td>
            <Td>{sub.ball_in_court || "—"}</Td>
            <Td>{fmtDate(sub.submitted_date)}</Td>
            <Td style={overdueStyle}>{fmtDate(getSubmittalDueDate(sub))}</Td>
            <Td>{fmtDate(sub.returned_date)}</Td>
          </>
        ) : (
          <>
            <Td style={{ color: warning, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }} colSpan={8}>
              No submittal linked - not tracked in approval pipeline
            </Td>
          </>
        )}
      </tr>

      {/* Expanded: show all submittals for this set */}
      {expanded && allSubmittals
        .filter((s) => s.id !== sub?.id)
        .map((s) => (
          <tr key={s.id} style={{ borderBottom: `1px solid ${border}`, background: surface1 }}>
            <Td style={{ paddingLeft: 32, color: textMuted }}>↳</Td>
            <Td />
            <Td />
            <Td style={{ color: accent }}>{s.submittal_number}</Td>
            <Td><StatusChip status={s.status} /></Td>
            <Td><DueChip info={dueInfo(getSubmittalDueDate(s), isClosedSubmittal(s))} /></Td>
            <Td style={{ textAlign: "center" }}>{s.round_number || 1}</Td>
            <Td>{s.ball_in_court || "—"}</Td>
            <Td>{fmtDate(s.submitted_date)}</Td>
            <Td>{fmtDate(getSubmittalDueDate(s))}</Td>
            <Td>{fmtDate(s.returned_date)}</Td>
          </tr>
        ))}

      {/* Expanded: show round history for the latest submittal */}
      {expanded && sub && roundsBySubmittal[sub.id]?.length > 0 && (
        <tr style={{ background: surface1 }}>
          <td colSpan={11} style={{ padding: "8px 32px 12px" }}>
            <RoundTimeline rounds={roundsBySubmittal[sub.id]} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Round Timeline (compact inline version) ────────────────────────────────

function RoundTimeline({ rounds }) {
  if (!rounds || rounds.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{
        fontFamily: mono, fontSize: 10, color: textMuted,
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginRight: 8,
      }}>
        Round History:
      </span>
      {rounds.map((r, i) => {
        const isLast = i === rounds.length - 1;
        const statusColor = STATUS_COLORS[r.status] || textMuted;
        const days = r.submitted_date && r.returned_date
          ? Math.ceil((new Date(r.returned_date) - new Date(r.submitted_date)) / 86400000)
          : null;

        return (
          <React.Fragment key={r.id}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 10px", borderRadius: 4,
              background: isLast ? `${statusColor}18` : surface2,
              border: `1px solid ${isLast ? statusColor : border}`,
            }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: textPrimary }}>
                R{r.round_number}
              </span>
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                background: `${statusColor}30`, color: statusColor, fontWeight: 600,
              }}>
                {r.status}
              </span>
              {days !== null && (
                <span style={{ fontSize: 9, color: textMuted }}>
                  {days}d
                </span>
              )}
            </div>
            {!isLast && (
              <span style={{ color: textMuted, fontSize: 10 }}>→</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Shared micro-components ────────────────────────────────────────────────

function Th({ children, style = {} }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: "left",
      fontFamily: mono, fontSize: 10, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.08em",
      color: textMuted, borderBottom: `1px solid ${border}`,
      ...style,
    }}>
      {children}
    </th>
  );
}

function Td({ children, style = {}, colSpan }) {
  return (
    <td colSpan={colSpan} className="sbd-num" style={{
      padding: "8px 12px",
      fontFamily: mono, fontSize: 12,
      color: textPrimary,
      ...style,
    }}>
      {children}
    </td>
  );
}

function StatusChip({ status }) {
  const color = STATUS_COLORS[status] || textMuted;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 3,
      fontSize: 10, fontWeight: 600,
      fontFamily: mono,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>
      {status}
    </span>
  );
}

function SummaryChip({ label, value, color }) {
  return (
    <div className="sbd-pill" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 4,
      background: surface2, border: `1px solid ${border}`,
    }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: textMuted, textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="sbd-num" style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return "—";
  }
}
