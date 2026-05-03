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
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile, Button } from "@/components/design-system";

// Lazy-load the existing pages as tab content
const DrawingsPage = lazy(() => import("@/pages/Drawings"));
const SubmittalsPage = lazy(() => import("@/pages/Submittals"));

// ── Design-system tokens ──────────────────────────────────────────────────
// Use the SAME CSS custom-property names as the rest of the app (Submittals,
// Drawings, RFIs, etc.). Previous version referenced nonexistent vars
// (--surface-0, --border) with dark hardcoded fallbacks, which made the
// Approval Matrix unreadable.
const accent      = "var(--accent)";
const accentMuted = "var(--accent-muted)";
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

// ─────────────────────────────────────────────────────────────────────────────

export default function DrawingSubmittalHub() {
  const { activeProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = activeProject?.id;
  const projectName = activeProject?.name || activeProject?.project_number || "";

  // Tab state from URL (persistent across navigation)
  const tabParam = searchParams.get("hub_tab") || "drawings";
  const activeTab = TABS.find((t) => t.key === tabParam) ? tabParam : "drawings";
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
    submittals, kpis, byDrawingSet, rounds, roundsBySubmittal,
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
    const inReview = active.filter((d) =>
      ["OFA", "BFA", "OFS", "BFS"].includes(d.stage)
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

  const isLoading = drawingsLoading || submittalsLoading;

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
      <div style={{
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
            {activeTab === "drawings" && <DrawingsPage />}
            {activeTab === "submittals" && <SubmittalsPage />}
            {activeTab === "matrix" && (
              <ApprovalMatrix
                drawingSets={drawingSets}
                submittals={submittals}
                roundsBySubmittal={roundsBySubmittal}
                byDrawingSet={byDrawingSet}
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

function ApprovalMatrix({ drawingSets, submittals, roundsBySubmittal, byDrawingSet, isLoading }) {
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
      .map((set) => ({
        ...set,
        submittals: setSubmittalMap[set.id] || [],
        latestSubmittal: (setSubmittalMap[set.id] || []).sort(
          (a, b) => (b.round_number || 1) - (a.round_number || 1)
        )[0] || null,
      }))
      .filter((set) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (set.set_name || "").toLowerCase().includes(q) ||
          (set.discipline || "").toLowerCase().includes(q) ||
          set.submittals.some((s) => (s.submittal_number || "").toLowerCase().includes(q))
        );
      });

    return activeSets;
  }, [drawingSets, submittals, search]);

  // Summary counts
  const summary = useMemo(() => {
    let noSubmittal = 0, pending = 0, approved = 0, rejected = 0;
    for (const row of matrixRows) {
      if (!row.latestSubmittal) { noSubmittal++; continue; }
      const st = row.latestSubmittal.status;
      if (st === "Approved" || st === "Approved as Noted" || st === "Released for Fabrication") approved++;
      else if (st === "Rejected" || st === "Revise and Resubmit") rejected++;
      else pending++;
    }
    return { noSubmittal, pending, approved, rejected, total: matrixRows.length };
  }, [matrixRows]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div style={{ padding: 20 }}>
      {/* ── Summary Bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap",
        alignItems: "center",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
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
        <SummaryChip label="Pending" value={summary.pending} color={warning} />
        <SummaryChip label="Approved" value={summary.approved} color={success} />
        <SummaryChip label="Needs Action" value={summary.rejected} color={error} />
      </div>

      {/* ── Matrix Table ─────────────────────────────────────────── */}
      <div style={{
        borderRadius: 6, border: `1px solid ${border}`,
        overflow: "hidden",
      }}>
        <table style={{
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
                <td colSpan={10} style={{
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

function MatrixRow({ drawingSet, sub, allSubmittals, roundsBySubmittal }) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = allSubmittals.length > 1;
  const overdueStyle = sub?.required_date && new Date(sub.required_date) < new Date() &&
    sub.status !== "Approved" && sub.status !== "Approved as Noted" && sub.status !== "Released for Fabrication" && sub.status !== "Void"
    ? { color: error, fontWeight: 700 } : {};

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
            <Td style={overdueStyle}>{fmtDate(sub.required_date)}</Td>
            <Td>{fmtDate(sub.returned_date)}</Td>
          </>
        ) : (
          <>
            <Td style={{ color: textMuted, fontStyle: "italic" }} colSpan={7}>
              No submittal linked
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
            <Td style={{ textAlign: "center" }}>{s.round_number || 1}</Td>
            <Td>{s.ball_in_court || "—"}</Td>
            <Td>{fmtDate(s.submitted_date)}</Td>
            <Td>{fmtDate(s.required_date)}</Td>
            <Td>{fmtDate(s.returned_date)}</Td>
          </tr>
        ))}

      {/* Expanded: show round history for the latest submittal */}
      {expanded && sub && roundsBySubmittal[sub.id]?.length > 0 && (
        <tr style={{ background: surface1 }}>
          <td colSpan={10} style={{ padding: "8px 32px 12px" }}>
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
    <td colSpan={colSpan} style={{
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
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 4,
      background: surface2, border: `1px solid ${border}`,
    }}>
      <span style={{ fontFamily: mono, fontSize: 10, color: textMuted, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color }}>
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
