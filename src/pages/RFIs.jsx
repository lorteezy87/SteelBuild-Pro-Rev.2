/**
 * RFIs — Request for Information hub, rebuilt on the Claude Design
 * industrial-OS design system.
 *
 * Page shell owns: React-Query data + mutations, URL state, search +
 * filter state, bulk selection, number-repair logic, overdue-alert
 * effect. Every visual component comes from `@/components/design-system`
 * or `src/pages/rfis/*`.
 *
 * Key redesigned surfaces:
 *   - CommandBar header with action buttons (Export / Import Log /
 *     AI Draft / New RFI)
 *   - 6-tile KPI row (ALL / OPEN / UNDER REVIEW / ANSWERED / OVERDUE
 *     / CRITICAL), click-to-filter
 *   - RFI Lifecycle Pipeline chevron (signature element — OPEN →
 *     REVIEW → ANSWERED → CLOSED, active stage highlighted)
 *   - Compact search + discipline pill bar
 *   - Dense sortable table with age-ramped colors, BIC chips, critical
 *     priority dot, hover-revealed actions
 *   - Fixed-overlay RFI detail modal with lifecycle chevron
 *   - Bottom-fixed bulk action bar
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import RfiLogImportModal from "@/components/rfis/RfiLogImportModal";
import RfiBulkEditModal from "@/components/rfis/RfiBulkEditModal";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { batchProcess } from "@/utils/batchProcess";

import {
  CommandBar,
  KpiTile,
  PhaseChevron,
  BulkActionBar,
  EmptyState,
  Button,
  Icon,
} from "@/components/design-system";

import { extractRfiSequence, buildRfiNumberRepairs, daysOpen, isClosed, isOverdue, exportRFIsToCSV } from "./rfis/utils";
import RfiRow, { RFI_ROW_GRID } from "./rfis/RfiRow";
import RfiDetailModal from "./rfis/RfiDetailModal";
import RfiInsightsStrip from "./rfis/RfiInsightsStrip";

const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

// Density presets persist in localStorage. "Compact" tightens the row
// height + drops the submitter sub-line; "Comfortable" gives the row
// 50px of breathing room. Density mutates the CSS variable that
// RfiRow reads for its row height.
const DENSITY_LS_KEY = "sbp-rfi-density";
const DENSITY_PRESETS = {
  compact:     { rowHeight: 28, label: "COMPACT" },
  normal:      { rowHeight: 38, label: "NORMAL" },
  comfortable: { rowHeight: 50, label: "COMFORTABLE" },
};
function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_LS_KEY);
    if (v && DENSITY_PRESETS[v]) return v;
  } catch { /* noop */ }
  return "normal";
}
const INSIGHTS_LS_KEY = "sbp-rfi-insights-collapsed";
function loadInsightsCollapsed() {
  try { return localStorage.getItem(INSIGHTS_LS_KEY) === "1"; } catch { return false; }
}

const LIFECYCLE_STAGES_BASE = [
  { id: "open",  label: "OPEN",       color: "var(--status-warning)" },
  { id: "rev",   label: "REVIEW",     color: "var(--status-review)"  },
  // GC replied but the answer was incomplete — needs another round.
  // Still treated as open by closed-state filters.
  { id: "incmp", label: "INCOMPLETE", color: "var(--status-error)"   },
  { id: "ans",   label: "ANSWERED",   color: "var(--status-success)" },
  { id: "cls",   label: "CLOSED",     color: "var(--text-muted)"     },
];

export default function RFIs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("All");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [showForm, setShowForm] = useState(false);
  const [showLogImport, setShowLogImport] = useState(false);
  const [editingRFI, setEditingRFI] = useState(null);
  const [selectedRFI, setSelectedRFI] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [density, setDensity] = useState(loadDensity);
  const [insightsCollapsed, setInsightsCollapsed] = useState(loadInsightsCollapsed);
  const handleDensityChange = (v) => {
    setDensity(v);
    try { localStorage.setItem(DENSITY_LS_KEY, v); } catch { /* noop */ }
  };
  const handleToggleInsights = () => {
    setInsightsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(INSIGHTS_LS_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };
  const densityPreset = DENSITY_PRESETS[density] || DENSITY_PRESETS.normal;

  /* ── Data ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: rfis = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }, "-submitted_date"),
    enabled: !!projectId,
  });
  const rfiQueryKeys = [["rfis", projectId], ["rfis"]];

  /* ── URL-driven selection (from cross-page deep links) ── */
  const urlRfiId = searchParams.get("id");
  const urlSearch = searchParams.get("search");
  useEffect(() => { if (urlSearch) setSearch(urlSearch); }, [urlSearch]);
  useEffect(() => {
    if (!urlRfiId || !rfis.length) return;
    const found = rfis.find((r) => r.id === urlRfiId);
    if (found) setSelectedRFI(found);
  }, [urlRfiId, rfis]);
  // Auto-open the create modal when QuickAddFAB navigated here with ?new=1.
  // The hook strips the param via `replace: true`, so a refresh of the
  // page doesn't re-open the modal and the back button still returns
  // the user to wherever they came from.
  useAutoOpenCreate(() => {
    setEditingRFI(null);
    setShowForm(true);
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.RFI.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, rfiQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI created");
    },
    onError: (e) => toastCrudError(e, "Failed to create RFI"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RFI.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, rfiQueryKeys, updated);
      if (selectedRFI?.id === updated.id) setSelectedRFI(updated);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update RFI"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.RFI.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, rfiQueryKeys, deletedId);
      if (selectedRFI?.id === deleteTarget?.id) setSelectedRFI(null);
      setDeleteTarget(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      toast.success("RFI deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete RFI"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.update(id, data));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      setSelectedIds(new Set());
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("RFIs updated");
      }
    },
    onError: (e) => toastCrudError(e, "Bulk update failed"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      const results = await batchProcess(ids, (id) => base44.entities.RFI.delete(id));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      const count = results.succeeded.length;
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      if (selectedRFI && [...selectedIds].includes(selectedRFI.id)) setSelectedRFI(null);
      await invalidateCrudQueries(qc, rfiQueryKeys);
      if (results.failed.length > 0) {
        toast.warning(`${count} deleted, ${results.failed.length} failed`);
      } else {
        toast.success(`${count} RFI${count === 1 ? "" : "s"} deleted`);
      }
    },
    onError: (e) => toastCrudError(e, "Bulk delete failed"),
  });

  /* ── Counts & filtered list ── */
  const counts = useMemo(() => {
    const overdue = rfis.filter((r) => isOverdue(r));
    return {
      all:        rfis.length,
      open:       rfis.filter((r) => r.status === "Open").length,
      review:     rfis.filter((r) => r.status === "Under Review").length,
      incomplete: rfis.filter((r) => r.status === "Incomplete Response").length,
      answered:   rfis.filter((r) => r.status === "Answered").length,
      closed:     rfis.filter((r) => r.status === "Closed").length,
      overdue:    overdue.length,
      critical:   rfis.filter((r) => r.priority === "Critical").length,
    };
  }, [rfis]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rfis
      .filter((r) => {
        if (filter === "open")       return r.status === "Open";
        if (filter === "review")     return r.status === "Under Review";
        if (filter === "incomplete") return r.status === "Incomplete Response";
        if (filter === "answered")   return r.status === "Answered";
        if (filter === "closed")     return r.status === "Closed";
        if (filter === "overdue")    return isOverdue(r);
        if (filter === "critical")   return r.priority === "Critical";
        return true;
      })
      .filter((r) => {
        if (disciplineFilter === "All") return true;
        return (r.discipline || "").toLowerCase().trim() === disciplineFilter.toLowerCase().trim();
      })
      .filter((r) => {
        if (!q) return true;
        return (
          (r.rfi_number || "").toLowerCase().includes(q) ||
          (r.title || "").toLowerCase().includes(q) ||
          (r.submitted_by || "").toLowerCase().includes(q) ||
          (r.drawing_reference || "").toLowerCase().includes(q) ||
          (r.question || "").toLowerCase().includes(q) ||
          (r.answer || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Default sort is RFI # ascending (1, 2, 3, …) so the list reads
        // chronologically by issue order. extractRfiSequence pulls the
        // trailing numeric segment, so RFI-001 / RFI-2 / RFI-10 sort as
        // 1, 2, 10 rather than the lexicographic 1, 10, 2.
        const numA = extractRfiSequence(a.rfi_number) ?? Number.MAX_SAFE_INTEGER;
        const numB = extractRfiSequence(b.rfi_number) ?? Number.MAX_SAFE_INTEGER;
        return numA - numB;
      });
  }, [rfis, filter, disciplineFilter, search]);

  /* ── Lifecycle pipeline stages (with live counts + active index) ── */
  const lifecycleStages = useMemo(() => [
    { ...LIFECYCLE_STAGES_BASE[0], count: counts.open },
    { ...LIFECYCLE_STAGES_BASE[1], count: counts.review },
    { ...LIFECYCLE_STAGES_BASE[2], count: counts.incomplete },
    { ...LIFECYCLE_STAGES_BASE[3], count: counts.answered },
    { ...LIFECYCLE_STAGES_BASE[4], count: counts.closed },
  ], [counts]);

  // Active stage = the first non-empty stage walking the pipeline backwards from
  // the action-needed end. Incomplete-response RFIs demand attention so they
  // win over Open/Review.
  const activeStageIdx = useMemo(() => {
    if (counts.incomplete > 0) return 2;
    if (counts.review > 0) return 1;
    if (counts.open > 0) return 0;
    if (counts.answered > 0) return 3;
    return 4;
  }, [counts]);

  /* ── Overdue → Alert background effect ── */
  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p.name || "";
    return m;
  }, [projects]);

  const alertsCreatedRef = useRef(new Set());
  useEffect(() => {
    if (!rfis.length) return;
    const createRFIAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "RFI_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in3 = new Date(today.getTime() + 3 * 86400000);
        for (const r of rfis) {
          if (["Answered", "Closed"].includes(r.status)) continue;
          if (!r.date_required) continue;
          if (alertsCreatedRef.current.has(r.id)) continue;
          const due = new Date(r.date_required + "T00:00:00");
          const isOD = due < today;
          const soon = !isOD && due <= in3;
          if (!isOD && !soon) continue;
          if (existingIds.has(r.id)) continue;
          const daysLate = isOD ? Math.floor((today - due) / 86400000) : 0;
          const liveProjectName = projectMap[r.project_id] || "";
          const alertTitle = isOD ? `${r.rfi_number} OVERDUE — ${daysLate}d` : `${r.rfi_number} due in ≤3 days`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "RFI_Overdue",
            severity: r.priority === "Critical" || daysLate >= 7 ? "Critical" : daysLate >= 3 || r.priority === "High" ? "High" : "Medium",
            title: alertTitle,
            description: `${r.rfi_number}: "${(r.title || "").slice(0, 60)}" · BIC: ${r.ball_in_court || "Contractor"} · Priority: ${r.priority}`,
            project_id: r.project_id,
            project_name: liveProjectName,
          });
          alertsCreatedRef.current.add(r.id);
        }
      } catch (e) {
        console.warn("RFI alert:", e);
      }
    };
    const t = setTimeout(createRFIAlerts, 2500);
    return () => clearTimeout(t);
  }, [rfis, projectMap]);

  /* ── Selection helpers ── */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((r) => r.id)) : new Set());

  /* ── Loading ── */
  if (rfisLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const activeProjectName = projects.find((p) => p.id === projectId)?.name || "All Projects";

  return (
    <div
      style={{
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        // Density mutates the row height that RfiRow reads via
        // var(--density-row-height, 38px). Set on the page wrapper
        // so every RfiRow underneath inherits it without prop drilling.
        "--density-row-height": `${densityPreset.rowHeight}px`,
      }}>
      <CommandBar
        eyebrow={`PROJECT MANAGEMENT · ${activeProjectName.toUpperCase()}`}
        title="RFIs"
        count={counts.open}
        unit=" OPEN"
        subtitle="Requests for Information · aging tracked · click tiles to filter"
      >
        <Button variant="secondary" icon="download" onClick={() => exportRFIsToCSV(filtered)}>
          EXPORT
        </Button>
        <Button variant="secondary" icon="upload" onClick={() => setShowLogImport(true)}>
          IMPORT LOG
        </Button>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => { setEditingRFI(null); setShowForm(true); }}
        >
          NEW RFI
        </Button>
      </CommandBar>

      {/* Insights strip — KPI tiles + aging buckets + ball-in-court
          donut + monthly-volume bar chart. Collapsible so a list-first
          PM can hide it after they've digested the health view. */}
      <RfiInsightsStrip
        rfis={rfis}
        collapsed={insightsCollapsed}
        onToggleCollapsed={handleToggleInsights}
      />

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        <KpiTile compact label="ALL"          value={counts.all}        color="var(--text-secondary)" active={filter === "all"}        onClick={() => setFilter("all")} />
        <KpiTile compact label="OPEN"         value={counts.open}       color="var(--status-warning)" active={filter === "open"}       onClick={() => setFilter("open")} />
        <KpiTile compact label="UNDER REVIEW" value={counts.review}     color="var(--status-review)"  active={filter === "review"}     onClick={() => setFilter("review")} />
        <KpiTile compact label="INCOMPLETE"   value={counts.incomplete} color="var(--status-error)"   active={filter === "incomplete"} onClick={() => setFilter("incomplete")} />
        <KpiTile compact label="ANSWERED"     value={counts.answered}   color="var(--status-success)" active={filter === "answered"}   onClick={() => setFilter("answered")} />
        <KpiTile compact label="OVERDUE"      value={counts.overdue}    color="var(--status-error)"   active={filter === "overdue"}    onClick={() => setFilter("overdue")} />
        <KpiTile compact label="CRITICAL"     value={counts.critical}   color="#FF6B35"               active={filter === "critical"}   onClick={() => setFilter("critical")} />
      </div>

      {/* RFI Lifecycle Pipeline */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          RFI LIFECYCLE PIPELINE
        </div>
        <PhaseChevron stages={lifecycleStages} activeIdx={activeStageIdx} showIcons={false} />
      </div>

      {/* Filter bar — sticky so it stays anchored as the user scrolls
          a long table. zIndex above row content but below modals. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 420 }}>
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <Icon name="search" size={12} />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RFI # or title…"
            style={{
              width: "100%",
              height: 30,
              padding: "0 12px 0 30px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        <div style={{ width: 1, height: 20, background: "var(--divider)" }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
          }}
        >
          DISCIPLINE
        </span>
        {DISCIPLINES.map((d) => {
          const active = disciplineFilter === d;
          return (
            <button
              key={d}
              onClick={() => setDisciplineFilter(d)}
              style={{
                padding: "3px 8px",
                borderRadius: "var(--radius-btn)",
                border: active ? "1px solid var(--accent)" : "1px solid transparent",
                background: active ? "var(--accent-muted)" : "var(--bg-surface-low)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {d}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Density picker — three preset rows. Persists to
            localStorage so the user's choice sticks across sessions. */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              marginRight: 4,
            }}
          >
            DENSITY
          </span>
          {Object.entries(DENSITY_PRESETS).map(([id, preset]) => {
            const active = density === id;
            return (
              <button
                key={id}
                onClick={() => handleDensityChange(id)}
                title={preset.label.toLowerCase()}
                style={{
                  padding: "3px 8px",
                  borderRadius: "var(--radius-btn)",
                  border: active ? "1px solid var(--accent)" : "1px solid transparent",
                  background: active ? "var(--accent-muted)" : "var(--bg-surface-low)",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div style={{ width: 1, height: 20, background: "var(--divider)", margin: "0 4px" }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
          }}
        >
          {filtered.length} of {rfis.length}
        </span>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: RFI_ROW_GRID,
            gap: 8,
            padding: "8px 12px",
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--border-default)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            // Sticky column header — stays pinned beneath the filter
            // bar (top: 44 leaves room for the filter bar's height).
            position: "sticky",
            top: 44,
            zIndex: 4,
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </div>
          <div>RFI #</div>
          <div>Title</div>
          <div>Discipline</div>
          <div>BIC</div>
          <div>Status</div>
          <div>Age</div>
          <div>Priority</div>
          <div style={{ textAlign: "right" }}>Cost Impact</div>
          <div></div>
        </div>
        {filtered.length > 0 ? (
          filtered.map((r, i) => (
            <RfiRow
              key={r.id}
              rfi={r}
              idx={i}
              density={density}
              selected={selectedIds.has(r.id)}
              onToggle={() => toggleSelect(r.id)}
              onOpen={() => setSelectedRFI(r)}
            />
          ))
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState
              icon="rfi"
              title={rfis.length === 0 ? "No RFIs yet — submit your first" : "No RFIs match your filters"}
              body={
                rfis.length === 0
                  ? "Click NEW RFI to start tracking field questions and clarifications. Use IMPORT LOG to bring an existing RFI log over from CSV in one shot."
                  : "Try clearing filters or adjusting the search query."
              }
            />
          </div>
        )}
      </div>

      {/* Bulk actions */}
      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "MARK ANSWERED",
            icon: "check",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Answered", date_answered: new Date().toISOString().split("T")[0] } }),
          },
          {
            label: "MARK UNDER REVIEW",
            icon: "clock",
            onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { status: "Under Review" } }),
          },
          {
            // Full bulk-edit modal — lets users update priority, BIC,
            // required date, etc. on the whole selection at once.
            label: "BULK EDIT",
            icon: "edit",
            onClick: () => setShowBulkEdit(true),
          },
          {
            label: "EXPORT",
            icon: "download",
            onClick: () => exportRFIsToCSV(filtered.filter((r) => selectedIds.has(r.id))),
          },
          {
            label: "DELETE",
            icon: "x",
            variant: "danger",
            onClick: () => setShowBulkDelete(true),
          },
        ]}
      />

      <RfiBulkEditModal
        open={showBulkEdit}
        count={selectedIds.size}
        onCancel={() => setShowBulkEdit(false)}
        onSubmit={(data) => {
          bulkUpdateMut.mutate({ ids: [...selectedIds], data });
          setShowBulkEdit(false);
        }}
      />

      {/* Modals */}
      <RfiDetailModal
        rfi={selectedRFI}
        onClose={() => setSelectedRFI(null)}
        onEdit={() => {
          setEditingRFI(selectedRFI);
          setSelectedRFI(null);
          setShowForm(true);
        }}
        onAdvanceStatus={(status) => {
          if (!selectedRFI) return;
          const extra = ["Answered", "Closed"].includes(status)
            ? { date_answered: new Date().toISOString().split("T")[0] }
            : {};
          updateMut.mutate({ id: selectedRFI.id, data: { status, ...extra } });
        }}
      />

      <RfiLogImportModal
        open={showLogImport}
        projectId={projectId}
        projectName={projects.find((p) => p.id === projectId)?.name}
        projects={projects}
        onClose={() => setShowLogImport(false)}
      />

      {showForm && (
        <RFIFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setEditingRFI(null); }}
          onSave={async (data) => {
            if (editingRFI) {
              updateMut.mutate({
                id: editingRFI.id,
                data: {
                  ...data,
                  project_name:
                    projects.find((p) => p.id === (data.project_id || projectId))?.name ||
                    data.project_name ||
                    editingRFI.project_name ||
                    "",
                },
              });
            } else {
              const num =
                data.rfi_number ||
                (await getNextFormattedNumber({
                  projectId: data.project_id || projectId,
                  recordType: "RFI",
                  entityName: "RFI",
                  fieldName: "rfi_number",
                  prefix: "RFI #",
                }));
              createMut.mutate({
                ...data,
                rfi_number: num,
                project_name:
                  projects.find((p) => p.id === (data.project_id || projectId))?.name ||
                  data.project_name ||
                  "",
              });
            }
            setShowForm(false);
            setEditingRFI(null);
          }}
          saving={createMut.isPending || updateMut.isPending}
          rfi={editingRFI}
          projectId={projectId}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete RFI"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
      <DeleteDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => bulkDeleteMut.mutate([...selectedIds])}
        title={`Delete ${selectedIds.size} RFIs`}
        description={`Permanently delete ${selectedIds.size} selected RFI${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </div>
  );
}
