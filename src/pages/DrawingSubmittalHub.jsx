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

import React, { useState, useMemo, Suspense } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { CommandBar, KpiTile } from "@/components/design-system";
import { computeFabReady } from "@/lib/submittalAnalytics";
import { compareDrawingSetPackages, formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import CycleTimeCard from "@/components/submittals/CycleTimeCard";
import AgingReportTable from "@/components/submittals/AgingReportTable";
import SubmittalVisualBoard from "@/components/submittals/SubmittalVisualBoard";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileStack,
  Gauge,
  Layers3,
  Link2,
  Search,
  ShieldCheck,
  User,
  Workflow,
} from "lucide-react";

// Lazy-load the existing pages as tab content — use lazyWithRetry so stale-
// chunk 404s after a deploy trigger a reload instead of a hard crash.
const DrawingsPage = lazyWithRetry(() => import("@/pages/Drawings"));
const SubmittalsPage = lazyWithRetry(() => import("@/pages/Submittals"));

// ── Design-system tokens ──────────────────────────────────────────────────
// Use the SAME CSS custom-property names as the rest of the app (Submittals,
// Drawings, RFIs, etc.). Previous version referenced nonexistent vars
// (--surface-0, --border) with dark hardcoded fallbacks, which made the
// Approval Matrix unreadable.
const accent      = "var(--accent)";
const surface1    = "var(--bg-surface-low)";
const surface2    = "var(--bg-surface-high)";
const border      = "var(--border-default)";
const textPrimary = "var(--text-primary)";
const textMuted   = "var(--text-muted)";
const mono        = "var(--font-mono)";
const success     = "var(--status-success)";
const warning     = "var(--status-warning)";
const error       = "var(--status-error)";
const info        = "var(--status-info)";
const review      = "var(--status-review)";

const TABS = [
  { key: "overview",   label: "Control Board", icon: Gauge },
  { key: "process",    label: "Process Board", icon: Layers3 },
  { key: "drawings",   label: "Drawing Register", icon: FileStack },
  { key: "submittals", label: "Submittal Register", icon: ClipboardList },
  { key: "matrix",     label: "Approval Matrix", icon: Workflow },
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

// Ball-in-court choices — matches the canonical list used in submittal modals
// (src/components/submittals/NewRoundModal.jsx).
const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

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

function getSetDisplayName({ parent, legacyName, fallback = "Ungrouped drawing set" } = {}) {
  return (parent?.set_name || legacyName || fallback).trim();
}

function compareDueDates(a, b) {
  const ad = daysUntil(a);
  const bd = daysUntil(b);
  if (ad === null && bd === null) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad - bd;
}

function earliestDate(values) {
  return values.filter(Boolean).sort(compareDueDates)[0] || null;
}

function isClosedSubmittal(submittal) {
  return CLOSED_SUBMITTAL_STATUSES.has(submittal?.status);
}

function isClosedDrawing(drawing) {
  return drawing?.stage === "Released" || drawing?.set_approval_status === "approved";
}

function rollupDrawingStage(sheets) {
  if (!sheets.length) return "No sheets";
  if (sheets.every(isClosedDrawing)) return "Released";
  if (sheets.some((d) => ["Rejected", "Revise and Resubmit", "Returned"].includes(d.stage))) return "Needs Action";
  if (sheets.some((d) => ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage))) return "In Review";
  return sheets[0]?.stage || "No stage";
}

function buildSetPackages(drawings, drawingSets, submittals) {
  const parentsById = new Map((drawingSets || []).filter((set) => !set?.is_deleted).map((set) => [set.id, set]));
  const parentsByName = new Map(
    Array.from(parentsById.values())
      .map((set) => [(set.set_name || "").trim().toLowerCase(), set])
      .filter(([name]) => !!name)
  );
  const packages = new Map();

  const ensurePackage = ({ setId = null, legacyName = "", parent = null }) => {
    const key = setId ? `id:${setId}` : `name:${(legacyName || "").trim() || "Ungrouped drawing set"}`;
    if (!packages.has(key)) {
      packages.set(key, {
        key,
        setId,
        name: getSetDisplayName({ parent, legacyName }),
        parent,
        sheets: [],
        submittals: [],
      });
    }
    return packages.get(key);
  };

  for (const parent of parentsById.values()) {
    ensurePackage({ setId: parent.id, legacyName: parent.set_name, parent });
  }

  for (const drawing of drawings || []) {
    if (!drawing || drawing.is_deleted || drawing.is_superseded) continue;
    const parent = drawing.drawing_set_id ? parentsById.get(drawing.drawing_set_id) : null;
    const pkg = ensurePackage({
      setId: drawing.drawing_set_id || null,
      legacyName: drawing.drawing_set_name,
      parent,
    });
    pkg.sheets.push(drawing);
  }

  for (const submittal of submittals || []) {
    if (!submittal || submittal.is_deleted) continue;
    const ids = Array.isArray(submittal.drawing_set_ids) ? submittal.drawing_set_ids.filter(Boolean) : [];
    if (ids.length) {
      ids.forEach((setId) => {
        const parent = parentsById.get(setId);
        ensurePackage({ setId, legacyName: parent?.set_name || submittal.drawing_set_name, parent }).submittals.push(submittal);
      });
      continue;
    }
    if (submittal.drawing_set_name) {
      const parent = parentsByName.get(submittal.drawing_set_name.trim().toLowerCase()) || null;
      ensurePackage({
        setId: parent?.id || null,
        legacyName: submittal.drawing_set_name,
        parent,
      }).submittals.push(submittal);
    }
  }

  return Array.from(packages.values())
    .filter((pkg) => pkg.name && pkg.name !== "Ungrouped drawing set" ? true : pkg.sheets.length || pkg.submittals.length)
    .sort(compareDrawingSetPackages);
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

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getStatusColor(status) {
  return STATUS_COLORS[status] || textMuted;
}

function getActionTone(item) {
  if (item?.due?.overdue) return error;
  if (item?.needsAction) return review;
  if (item?.due?.dueSoon) return warning;
  return info;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DrawingSubmittalHub() {
  const { activeProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
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

  const setPackages = useMemo(
    () => buildSetPackages(drawings, drawingSets, submittals),
    [drawings, drawingSets, submittals]
  );

  // ── Drawing KPIs ───────────────────────────────────────────────────────
  const drawingKpis = useMemo(() => {
    const active = drawings.filter((d) => !d.is_superseded && !d.is_deleted);
    const released = setPackages.filter((pkg) => pkg.sheets.length > 0 && pkg.sheets.every(isClosedDrawing)).length;
    // "In review" = active workflow stages (post-077): IFA / OFA / BFA / OFS / IFC.
    const inReview = setPackages.filter((pkg) =>
      pkg.sheets.some((d) => ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage))
    ).length;
    const overdueDrawings = setPackages.filter((pkg) =>
      pkg.sheets.some((d) => dueInfo(getDrawingDueDate(d), isClosedDrawing(d)).overdue)
    ).length;
    return {
      totalSets: setPackages.length,
      totalSheets: active.length,
      released,
      inReview,
      overdue: overdueDrawings,
    };
  }, [drawings, setPackages]);

  // ── Fab-Ready KPI ──────────────────────────────────────────────────────
  const fabReady = useMemo(
    () => computeFabReady(drawings, submittals),
    [drawings, submittals]
  );

  const isLoading = drawingsLoading || submittalsLoading;

  const triage = useMemo(() => {
    const activeSubmittals = submittals.filter((s) => !s.is_deleted);

    const setItems = setPackages.map((pkg) => {
      const sortedSubmittals = pkg.submittals
        .slice()
        .sort((a, b) => (b.round_number || 1) - (a.round_number || 1));
      const latestSubmittal = sortedSubmittals[0] || null;
      const closed = latestSubmittal ? isClosedSubmittal(latestSubmittal) : (pkg.sheets.length > 0 && pkg.sheets.every(isClosedDrawing));
      const dueDate = getSubmittalDueDate(latestSubmittal) || earliestDate(pkg.sheets.map(getDrawingDueDate));
      const needsAction =
        (latestSubmittal && ACTION_STATUSES.has(latestSubmittal.status)) ||
        pkg.sheets.some((drawing) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage));
      const status = latestSubmittal?.status || rollupDrawingStage(pkg.sheets);
      const owner =
        latestSubmittal?.ball_in_court ||
        latestSubmittal?.assigned_to ||
        latestSubmittal?.reviewer ||
        pkg.sheets.find((drawing) => drawing.ball_in_court || drawing.assigned_to || drawing.reviewer)?.ball_in_court ||
        pkg.sheets.find((drawing) => drawing.assigned_to)?.assigned_to ||
        pkg.sheets.find((drawing) => drawing.reviewer)?.reviewer ||
        "Unassigned";
      const submittalLabel = latestSubmittal?.submittal_number ? `Submittal ${latestSubmittal.submittal_number}` : "No linked submittal";
      return {
        id: `set-${pkg.key}`,
        kind: "Drawing Set",
        title: pkg.name,
        group: `${pkg.sheets.length} sheet${pkg.sheets.length === 1 ? "" : "s"} - ${submittalLabel}`,
        status,
        owner,
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "drawings",
        // Entity references for inline editing
        _submittalId: latestSubmittal?.id || null,
        _drawingSetId: pkg.setId || null,
        _firstSheetId: pkg.sheets[0]?.id || null,
      };
    });

    const linkedSubmittalIds = new Set(
      setPackages.flatMap((pkg) => pkg.submittals.map((submittal) => submittal.id).filter(Boolean))
    );
    const unlinkedSubmittalItems = activeSubmittals
      .filter((submittal) => !linkedSubmittalIds.has(submittal.id))
      .map((submittal) => {
      const closed = isClosedSubmittal(submittal);
      const dueDate = getSubmittalDueDate(submittal);
      const title = [submittal.submittal_number, submittal.title || submittal.description]
        .filter(Boolean)
        .join(" - ") || "Untitled submittal";
      const needsAction = ACTION_STATUSES.has(submittal.status);
      return {
        id: `submittal-${submittal.id}`,
        kind: "Unlinked Submittal",
        title,
        group: "No drawing set name linked",
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "submittals",
        // Entity references for inline editing
        _submittalId: submittal.id,
        _drawingSetId: null,
        _firstSheetId: null,
      };
    });

    const openItems = [...setItems, ...unlinkedSubmittalItems].filter((item) => !item.closed);
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
      setItems,
      unlinkedSubmittalItems,
      openItems: openItems.sort(itemUrgency),
      overdue,
      dueSoon,
      needsAction,
      noDate,
      pipelineCounts,
      overdueDrawingSets: overdue.filter((item) => item.kind === "Drawing Set").length,
      overdueUnlinkedSubmittals: overdue.filter((item) => item.kind === "Unlinked Submittal").length,
      dueSoonDrawingSets: dueSoon.filter((item) => item.kind === "Drawing Set").length,
      noDateDrawingSets: noDate.filter((item) => item.kind === "Drawing Set").length,
    };
  }, [submittals, setPackages]);

  const tabCounts = useMemo(() => ({
    overview: triage.openItems.length,
    process: setPackages.length + triage.unlinkedSubmittalItems.length,
    drawings: drawingKpis.totalSets,
    submittals: kpis.total,
    matrix: drawingSets.filter((set) => !set?.is_deleted).length,
  }), [triage.openItems.length, triage.unlinkedSubmittalItems.length, setPackages.length, drawingKpis.totalSets, kpis.total, drawingSets]);

  // ── Inline quick-action mutations (Next Decision card) ────────────────
  const invalidateHub = () => {
    qc.invalidateQueries({ queryKey: ["drawing-sets", projectId] });
    qc.invalidateQueries({ queryKey: ["drawings", projectId] });
    qc.invalidateQueries({ queryKey: ["submittals", projectId] });
  };

  const updateOwnerMut = useMutation({
    mutationFn: async ({ item, owner }) => {
      if (item._submittalId) {
        await base44.entities.Submittal.update(item._submittalId, { ball_in_court: owner });
      } else if (item._firstSheetId) {
        await base44.entities.Drawing.update(item._firstSheetId, { assigned_to: owner });
      } else {
        throw new Error("No entity available to assign owner");
      }
    },
    onSuccess: (_data, { owner }) => {
      invalidateHub();
      toast.success(`Owner assigned: ${owner}`);
    },
    onError: (err) => toast.error("Failed to assign owner: " + (err?.message || "Unknown")),
  });

  const updateDueDateMut = useMutation({
    mutationFn: async ({ item, date }) => {
      if (item._submittalId) {
        await base44.entities.Submittal.update(item._submittalId, { required_date: date });
      } else if (item._firstSheetId) {
        await base44.entities.Drawing.update(item._firstSheetId, { due_date: date });
      } else {
        throw new Error("No entity available to set due date");
      }
    },
    onSuccess: () => {
      invalidateHub();
      toast.success("Due date set");
    },
    onError: (err) => toast.error("Failed to set due date: " + (err?.message || "Unknown")),
  });

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="drawing-submittal-hub"
      style={{
        minHeight: "100vh",
        background: "var(--bg-page)",
        color: textPrimary,
        padding: "24px 28px",
      }}
    >
      {/* ── Command Bar ──────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={projectName ? `Detailing control - ${projectName}` : "Detailing control"}
        title="Drawing & Submittal Control"
        count={drawingKpis.totalSets}
        unit={` sets | ${drawingKpis.totalSheets} sheets`}
        subtitle="Set-level drawing packages, submittal status, due dates, ownership, and fabrication-release readiness."
      >
        <HeaderSignal
          icon={AlertTriangle}
          label="Overdue"
          value={triage.overdue.length}
          tone={triage.overdue.length ? error : success}
        />
        <HeaderSignal
          icon={Gauge}
          label="In Review"
          value={drawingKpis.inReview}
          tone={drawingKpis.inReview > 0 ? info : textMuted}
        />
        <HeaderSignal
          icon={Link2}
          label="Unlinked"
          value={triage.unlinkedSubmittalItems.length}
          tone={triage.unlinkedSubmittalItems.length ? warning : textMuted}
        />
      </CommandBar>

      {/* ── KPI Strip ────────────────────────────────────────────────── */}
      <div className="sbp-hub-kpi-strip" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        marginBottom: 14,
      }}>
        <KpiTile compact label="Drawing Sets" value={drawingKpis.totalSets} sub={`${drawingKpis.totalSheets} active sheets`} color={accent} loading={isLoading} />
        <KpiTile compact label="Sets Released" value={drawingKpis.released} color={success} loading={isLoading} />
        <KpiTile compact label="Sets In Review" value={drawingKpis.inReview} color={info} loading={isLoading} />
        <KpiTile compact label="Submittals" value={kpis.total} sub={`${kpis.pending} pending`} color={accent} loading={isLoading} />
        <KpiTile compact label="Needs Action" value={kpis.rejected} color={review} loading={isLoading} />
        <KpiTile compact label="Overdue" value={Math.max(kpis.overdue, triage.overdue.length)} color={error} loading={isLoading} />
        <KpiTile compact label="Fab Ready" value={`${fabReady.numerator}/${fabReady.denominator}`} sub={`${fabReady.percent}% released`} color={success} loading={isLoading} />
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="sbp-hub-tabbar" style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        padding: 6,
        marginBottom: 16,
        background: "color-mix(in srgb, var(--bg-surface) 82%, transparent)",
        border: `1px solid ${border}`,
        borderRadius: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              className={`sbp-hub-tab${isActive ? " is-active" : ""}`}
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 40,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${isActive ? accent : "transparent"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high) 86%)"
                  : "transparent",
                color: isActive ? textPrimary : textMuted,
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              <span
                className="sbd-num"
                data-hub-tab-count="true"
                style={{
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: isActive ? "color-mix(in srgb, var(--accent) 18%, transparent)" : surface2,
                  border: `1px solid ${isActive ? "color-mix(in srgb, var(--accent) 32%, transparent)" : border}`,
                  color: isActive ? accent : textMuted,
                  fontSize: 10,
                  lineHeight: 1.2,
                }}
              >
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      <div style={{ minHeight: 0, position: "relative" }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingSkeleton />}>
            {activeTab === "overview" && (
              <TriageBoard
                triage={triage}
                kpis={kpis}
                drawingKpis={drawingKpis}
                isLoading={isLoading}
                onOpenTab={setActiveTab}
                onUpdateOwner={(item, owner) => updateOwnerMut.mutate({ item, owner })}
                onUpdateDueDate={(item, date) => updateDueDateMut.mutate({ item, date })}
                isSaving={updateOwnerMut.isPending || updateDueDateMut.isPending}
              />
            )}
            {activeTab === "process" && (
              <SubmittalVisualBoard
                setPackages={setPackages}
                submittals={submittals}
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

function HeaderSignal({ icon: Icon, label, value, tone }) {
  return (
    <div className="sbp-header-signal" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      minHeight: 36,
      padding: "7px 10px",
      borderRadius: 10,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
      color: tone,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <Icon size={14} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary, fontSize: 13 }}>
        {value}
      </span>
    </div>
  );
}

function TriageBoard({ triage, kpis, drawingKpis, isLoading, onOpenTab, onUpdateOwner, onUpdateDueDate, isSaving }) {
  if (isLoading) return <LoadingSkeleton />;

  const focusItem = triage.overdue[0] || triage.dueSoon[0] || triage.needsAction[0] || triage.noDate[0] || null;
  const focusTone = getActionTone(focusItem);
  const topStatuses = Object.entries(triage.pipelineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const focusRoute = focusItem?.routeTab || "matrix";
  const criticalItems = Array.from(
    new Map([...triage.overdue, ...triage.needsAction, ...triage.dueSoon].map((item) => [item.id, item])).values()
  ).slice(0, 12);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
        gap: 14,
      }}>
        <div className="sbd-card-strong" style={{
          padding: 20,
          borderRadius: 16,
          border: `1px solid ${triage.overdue.length ? "color-mix(in srgb, var(--status-error) 56%, var(--border-default))" : border}`,
          background: triage.overdue.length
            ? "linear-gradient(135deg, color-mix(in srgb, var(--status-error) 13%, var(--bg-surface) 87%), var(--bg-surface-low))"
            : "linear-gradient(135deg, color-mix(in srgb, var(--status-success) 8%, var(--bg-surface) 92%), var(--bg-surface-low))",
          boxShadow: triage.overdue.length ? "0 16px 42px rgba(248,81,73,0.12)" : "var(--shadow-card)",
        }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: triage.overdue.length ? error : success,
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            {triage.overdue.length ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {triage.overdue.length ? "Immediate approval risk" : "Pipeline current"}
          </div>
          <h2 style={{
            margin: 0,
            color: textPrimary,
            fontFamily: "var(--font-display)",
            fontSize: 34,
            lineHeight: 1,
            fontWeight: 600,
          }}>
            {triage.overdue.length
              ? `${pluralize(triage.overdue.length, "item")} past due`
              : "No overdue drawing or submittal work"}
          </h2>
          <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", maxWidth: 880, lineHeight: 1.5, fontSize: 13 }}>
            {triage.overdue.length
              ? `${pluralize(triage.overdueDrawingSets, "drawing set")} and ${pluralize(triage.overdueUnlinkedSubmittals, "unlinked submittal")} need attention before detailing can hand off cleanly.`
              : "Use this control board to watch due dates, rejected or resubmittal work, missing dates, and fabrication release readiness by drawing set."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            <RiskPill icon={Clock3} label="Due this week" value={triage.dueSoon.length} color={warning} />
            <RiskPill icon={AlertTriangle} label="Needs action" value={triage.needsAction.length} color={review} />
            <RiskPill icon={CalendarClock} label="Missing dates" value={triage.noDate.length} color={textMuted} />
            <RiskPill icon={CheckCircle2} label="Sets Released" value={drawingKpis.released} color={success} />
          </div>
        </div>

        <div className="sbd-card" style={{ padding: 18, borderRadius: 16, border: `1px solid ${focusItem ? focusTone : border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: mono, color: textMuted, fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Next Decision
              </div>
              <h3 style={{ margin: "6px 0 0", color: textPrimary, fontSize: 18, lineHeight: 1.2 }}>
                {focusItem ? focusItem.title : "No open exception"}
              </h3>
            </div>
            <DueChip info={focusItem?.due || dueInfo(null)} compact />
          </div>
          {focusItem ? (
            <>
              <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.45 }}>
                {focusItem.group} - {focusItem.status}
              </div>
              {/* ── Inline Quick-Action Controls ──────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                <InlineOwnerControl
                  currentOwner={focusItem.owner}
                  onAssign={(owner) => onUpdateOwner(focusItem, owner)}
                  disabled={isSaving}
                />
                <InlineDateControl
                  currentDate={focusItem.dueDate}
                  isOverdue={focusItem.due.overdue}
                  onSetDate={(date) => onUpdateDueDate(focusItem, date)}
                  disabled={isSaving}
                />
              </div>
              <button
                type="button"
                onClick={() => onOpenTab(focusRoute)}
                className="sbd-btn-primary"
                style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                Open Work
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <EmptyState text="No overdue, due-soon, action, or missing-date work is currently flagged." />
          )}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <TriageMetric icon={AlertTriangle} label="Overdue Sets" value={triage.overdueDrawingSets} color={error} sub={`${triage.overdueUnlinkedSubmittals} unlinked subs`} />
        <TriageMetric icon={Clock3} label="Due This Week" value={triage.dueSoonDrawingSets} color={warning} sub="Next 7 days" />
        <TriageMetric icon={ShieldCheck} label="Needs Action" value={triage.needsAction.length} color={review} sub="Rejected / resubmit" />
        <TriageMetric icon={CalendarClock} label="Missing Dates" value={triage.noDateDrawingSets} color={textMuted} sub="Needs cleanup" />
        <TriageMetric icon={ClipboardList} label="Pending Review" value={kpis.pending} color={warning} sub={`${kpis.total} total submittals`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Critical Work Queue"
          subtitle="Overdue, rejected, resubmittal, and near-term items."
          items={criticalItems}
          empty="No critical work is currently queued."
          onOpenTab={onOpenTab}
        />
        <PipelinePanel topStatuses={topStatuses} openCount={triage.openItems.length} onOpenTab={onOpenTab} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
        <TriageList
          title="Due Next 7 Days"
          subtitle="Drawing sets with required dates approaching."
          items={triage.dueSoon.slice(0, 8)}
          empty="No drawing or submittal due dates in the next week."
          onOpenTab={onOpenTab}
        />
        <TriageList
          title="Missing Due Dates"
          subtitle="Assign dates before these can be managed against schedule."
          items={triage.noDate.slice(0, 8)}
          empty="All open items have due dates."
          onOpenTab={onOpenTab}
        />
      </div>
    </div>
  );
}

// ── Inline Quick-Action Controls ────────────────────────────────────────────
// Compact controls shown directly on the "Next Decision" card so users can
// assign an owner or set a due date without navigating away.

function InlineOwnerControl({ currentOwner, onAssign, disabled }) {
  const [open, setOpen] = useState(false);
  const isUnassigned = !currentOwner || currentOwner === "Unassigned";

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isUnassigned ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <User size={10} />
        Owner
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isUnassigned ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title="Click to assign owner"
        >
          {isUnassigned ? "Assign..." : currentOwner}
        </button>
      ) : (
        <select
          autoFocus
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) {
              onAssign(e.target.value);
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="" disabled>Select owner...</option>
          {BIC_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{choice}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function InlineDateControl({ currentDate, isOverdue, onSetDate, disabled }) {
  const [open, setOpen] = useState(false);
  const hasDate = !!currentDate;

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isOverdue ? "color-mix(in srgb, var(--status-error) 46%, transparent)" : !hasDate ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <CalendarDays size={10} />
        Required
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isOverdue ? error : !hasDate ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title="Click to set due date"
        >
          {hasDate ? fmtDate(currentDate) : "Set date..."}
        </button>
      ) : (
        <input
          type="date"
          autoFocus
          disabled={disabled}
          defaultValue={currentDate ? new Date(currentDate).toISOString().split("T")[0] : ""}
          onChange={(e) => {
            if (e.target.value) {
              onSetDate(e.target.value);
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        />
      )}
    </div>
  );
}

function RiskPill({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 10px",
      borderRadius: 999,
      background: `color-mix(in srgb, ${color} 11%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}>
      <Icon size={13} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary }}>{value}</span>
    </div>
  );
}

function PipelinePanel({ topStatuses, openCount, onOpenTab }) {
  return (
    <div className="sbd-card" style={{ padding: 16, borderRadius: 16, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: textPrimary, fontSize: 16 }}>Open Pipeline</h3>
          <p style={{ margin: "4px 0 0", color: textMuted, fontSize: 12 }}>
            Current approval status distribution.
          </p>
        </div>
        <button type="button" className="sbd-btn-ghost" onClick={() => onOpenTab("matrix")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Matrix
          <ArrowRight size={13} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {topStatuses.length === 0 ? (
          <EmptyState text="No open items to summarize." />
        ) : (
          topStatuses.map(([status, count]) => (
            <PipelineBar key={status} status={status} count={count} total={openCount} />
          ))
        )}
      </div>
    </div>
  );
}

function TriageMetric({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="sbd-card" style={{ padding: "14px 16px", borderRadius: 14, borderTop: `2px solid ${color}`, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted, fontWeight: 800 }}>
          {label}
        </div>
        {Icon && <Icon size={15} color={color} />}
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
  const tone = getActionTone(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.5fr) minmax(90px, 0.35fr) minmax(120px, 0.45fr) 28px",
        gap: 12,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${item.due.overdue ? "color-mix(in srgb, var(--status-error) 60%, transparent)" : border}`,
        background: item.due.overdue
          ? "color-mix(in srgb, var(--status-error) 11%, var(--bg-surface-low) 89%)"
          : "var(--bg-surface-low)",
        color: textPrimary,
        cursor: "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, marginBottom: 5 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: tone,
            boxShadow: `0 0 12px color-mix(in srgb, ${tone} 45%, transparent)`,
            flex: "0 0 auto",
          }} />
          <span style={{ fontFamily: mono, fontSize: 9, color: item.kind === "Drawing Set" ? accent : success, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>
            {item.kind}
          </span>
        </div>
        <div style={{ color: textPrimary, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
          {item.title}
        </div>
        <div style={{ color: textMuted, fontSize: 12, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.group} - {item.status}
        </div>
      </div>
      <div>
        <DueChip info={item.due} compact />
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ color: textMuted, fontFamily: mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner / Due</span>
        <br />
        {item.owner} - {fmtDate(item.dueDate)}
      </div>
      <div style={{ color: textMuted, display: "flex", justifyContent: "flex-end" }}>
        <ArrowRight size={15} />
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

function DueChip({ info, compact = false }) {
  return (
    <span style={{
      display: "inline-block",
      marginTop: compact ? 0 : 6,
      padding: compact ? "3px 7px" : "2px 6px",
      borderRadius: 999,
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
          formatDrawingSetNumber(set).toLowerCase().includes(q) ||
          (set.set_name || "").toLowerCase().includes(q) ||
          (set.discipline || "").toLowerCase().includes(q) ||
          set.submittals.some((s) => (s.submittal_number || "").toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        return compareDrawingSetPackages(a, b);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Analytics (cycle-time + aging) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))", gap: 16 }}>
        <CycleTimeCard submittals={submittals} isLoading={isLoading} />
        <AgingReportTable submittals={submittals} isLoading={isLoading} />
      </div>

      {/* ── Summary Bar ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap",
        alignItems: "center",
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${border}`,
        background: surface1,
      }}>
        <div style={{ flex: "1 1 320px", minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Layers3 size={15} color={accent} />
            <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>
              Approval Matrix
            </div>
          </div>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: 520,
            padding: "8px 11px",
            borderRadius: 10,
            border: `1px solid ${border}`,
            background: surface2,
            color: textMuted,
          }}>
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets, submittals..."
            style={{
              width: "100%",
              background: "transparent",
              color: textPrimary,
              border: 0,
              fontFamily: mono, fontSize: 12,
              outline: "none",
            }}
          />
          </label>
        </div>
        <SummaryChip icon={Layers3} label="Sets" value={summary.total} color={accent} />
        <SummaryChip icon={Link2} label="No Submittal" value={summary.noSubmittal} color={textMuted} />
        <SummaryChip icon={AlertTriangle} label="Overdue" value={summary.overdue} color={error} />
        <SummaryChip icon={Clock3} label="Due Soon" value={summary.dueSoon} color={warning} />
        <SummaryChip icon={ClipboardList} label="Pending" value={summary.pending} color={warning} />
        <SummaryChip icon={ShieldCheck} label="Approved" value={summary.approved} color={success} />
        <SummaryChip icon={AlertTriangle} label="Needs Action" value={summary.rejected} color={review} />
      </div>

      {/* ── Matrix Table ─────────────────────────────────────────── */}
      <div className="sbd-card" style={{
        borderRadius: 16, border: `1px solid ${border}`,
        overflowX: "auto",
        padding: 0,
      }}>
        <table className="sbd-table" style={{
          width: "100%", minWidth: 980, borderCollapse: "collapse",
          fontFamily: mono, fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: surface2 }}>
              <Th>Drawing Set Package</Th>
              <Th>Set #</Th>
              <Th>Discipline</Th>
              <Th style={{ textAlign: "center" }}>Sheets</Th>
              <Th>Linked Submittal</Th>
              <Th>Status</Th>
              <Th>Due Status</Th>
              <Th style={{ textAlign: "center" }}>Round</Th>
              <Th>Ball In Court</Th>
              <Th>Submitted</Th>
              <Th>Required</Th>
              <Th>Returned</Th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{
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
  const rowStatusColor = getStatusColor(sub?.status);

  return (
    <>
      <tr
        onClick={hasMultiple ? () => setExpanded(!expanded) : undefined}
        style={{
          borderBottom: `1px solid ${border}`,
          borderLeft: `3px solid ${sub ? rowStatusColor : warning}`,
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
        <Td style={{ color: accent, fontWeight: 800 }}>{formatDrawingSetNumber(drawingSet)}</Td>
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
          <td colSpan={12} style={{ padding: "8px 32px 12px" }}>
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

function SummaryChip({ icon: Icon, label, value, color }) {
  return (
    <div className="sbd-pill" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 999,
      background: surface2, border: `1px solid ${border}`,
    }}>
      {Icon && <Icon size={13} color={color} />}
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
