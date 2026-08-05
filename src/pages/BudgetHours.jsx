/**
 * Budget Hours — per-project budget vs actual labor-hours tracker.
 *
 * Mirrors the Estimating Kickoff sheet: each scope-item row carries
 * Shop / Field budget hours (set once at kickoff) and Shop / Field
 * actual hours (rolled up live). Variance % surfaces in red / amber /
 * green so PMs can spot scopes that are bleeding hours without
 * leaving the dashboard.
 *
 * Two preset starters ship out of the box:
 *  - "Estimating Kickoff (Standard 12)" — the 12 canonical scope items
 *    from the workbook (Embeds, Columns, Beams, Joists, Bridging,
 *    Ledger, Deck-Support, Roof Frames, Lintels, Moment Frame Bracing,
 *    Stairs & Rail, Site Steel).
 *  - "Empty" — a single blank row.
 *
 * Optional: when a row carries `metadata.linked_work_package_ids[]`,
 * the actuals roll up from those WPs' shop_hours_actual /
 * field_hours_actual instead of being entered manually. The default
 * is manual entry — link-up is opt-in per row from the row's edit
 * popover.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { usePermissions } from "@/services/permissions";
import { logActivity } from "@/services/auditLogger";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toastCrudError } from "@/components/shared/crudFeedback";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";
import BudgetHoursControlCenter from "./budgetHours/BudgetHoursControlCenter";
import ScopeItemFormModal from "./budgetHours/ScopeItemFormModal";

/* ─────────────────────────────────────────────
   Variance helpers
───────────────────────────────────────────── */
import {
  filterLiveBudgetRows,
  buildWpsById,
  filterCommandBudgetRows,
  BUDGET_HOURS_CSV_HEADERS,
  buildBudgetHoursCsvRows,
} from "./budgetHours/budgetHoursControlCenter.derive";
import {
  PresetDialog,
} from "./budgetHours/BudgetHoursPageUi";

export default function BudgetHours() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [presetOpen, setPresetOpen] = useState(false);
  // Control-center filters remain page-owned so query and mutation state stays stable.
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  // Scope-item create/edit modal + delete confirm (canonical presentation CRUD).
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeEditTarget, setScopeEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canCreateScope = can("create", "budget_hour_item");
  const canEditScope = can("edit", "budget_hour_item");
  const canDeleteScope = can("delete", "budget_hour_item");

  /* ── Data ── */
  // The entity wrapper doesn't auto-filter soft-deletes, so the query
  // returns rows even after `is_deleted=true`. We strip them here so
  // every downstream consumer (the Standard / Specialty buckets, the
  // Misses sub-table, totals) sees an "active rows only" view and the
  // user actually sees the row disappear after they click Remove.
  const {
    data: rawRows = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["budget-hour-items", projectId],
    queryFn: () => (projectId ? entities.BudgetHourItem.filter({ project_id: projectId }, "sort_order") : []),
    enabled: !!projectId,
  });
  const rows = useMemo(() => filterLiveBudgetRows(rawRows), [rawRows]);
  const { data: wps = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => (projectId ? entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });
  const wpsById = useMemo(() => buildWpsById(wps), [wps]);

  /* ── Mutations ──
     Audit + cache invalidation mirror the canonical Deliveries pattern:
     logActivity (fire-and-forget) + invalidateEntity (fans out every
     budget-hour-items key) + toastCrudError on failure. deleteMut stays a
     SOFT delete (is_deleted flag) — recoverable, never a hard delete. */
  const createMut = useMutation({
    mutationFn: (data) => entities.BudgetHourItem.create(withProjectId(data, projectId)),
    onSuccess: async (created) => {
      logActivity("budget_hour_item", "created", created, { projectId });
      await invalidateEntity(qc, "budget_hour_item", projectId);
    },
    onError: (e) => toastCrudError(e, "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }) => entities.BudgetHourItem.update(id, patch),
    onSuccess: async (updated) => {
      logActivity("budget_hour_item", "updated", updated, { projectId });
      await invalidateEntity(qc, "budget_hour_item", projectId);
    },
    onError: (e) => toastCrudError(e, "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.BudgetHourItem.update(id, { is_deleted: true, deleted_at: new Date().toISOString() }),
    onSuccess: async (updated, deletedId) => {
      logActivity(
        "budget_hour_item",
        "deleted",
        updated || { id: deletedId, project_id: projectId, scope_item: deleteTarget?.scope_item },
        { projectId },
      );
      await invalidateEntity(qc, "budget_hour_item", projectId);
      toast.success("Row removed");
    },
    onError: (e) => toastCrudError(e, "Delete failed"),
  });

  /* ── Buckets ── */

  /* ── Handlers ── */
  const addBlankRow = () => {
    if (!projectId) return;
    const maxSort = Math.max(0, ...rows.map((r) => Number(r.sort_order) || 0));
    createMut.mutate({
      project_id: projectId,
      category: "Standard",
      scope_item: "New Scope Item",
      sort_order: maxSort + 10,
      is_specialty: false,
      shop_hours_budget: 0,
      shop_hours_actual: 0,
      field_hours_budget: 0,
      field_hours_actual: 0,
      metadata: {},
    });
  };

  const applyPreset = async (preset) => {
    if (!projectId) return;
    setPresetOpen(false);
    const built = preset.build();
    // Sequentially create so sort_order stays stable; small list (≤12).
    for (const row of built) {
      try {
        await entities.BudgetHourItem.create(withProjectId(row, projectId));
      } catch (e) {
        toast.error(`Preset row "${row.scope_item}" failed: ${toUserErrorMessage(e, "unknown")}`);
      }
    }
    qc.invalidateQueries({ queryKey: ["budget-hour-items", projectId] });
    toast.success(`Loaded "${preset.label}"`);
  };

  const saveCell = (id, patch) => updateMut.mutate({ id, patch });

  /* ── Scope-item modal CRUD ── */
  const openCreateScope = () => {
    setScopeEditTarget(null);
    setScopeModalOpen(true);
  };

  const openEditScope = (row) => {
    setScopeEditTarget(row);
    setScopeModalOpen(true);
  };

  // Save from the modal — create (new row, next sort_order) or update ({id,patch}).
  const handleScopeSave = (patch) => {
    if (!projectId) return;
    if (scopeEditTarget) {
      updateMut.mutate(
        { id: scopeEditTarget.id, patch },
        { onSuccess: () => { setScopeModalOpen(false); setScopeEditTarget(null); } }
      );
    } else {
      const maxSort = Math.max(0, ...rows.map((r) => Number(r.sort_order) || 0));
      createMut.mutate(
        { ...patch, project_id: projectId, sort_order: maxSort + 10, metadata: {} },
        { onSuccess: () => setScopeModalOpen(false) }
      );
    }
  };

  const requestDeleteRow = (row) => setDeleteTarget(row);
  const confirmDeleteRow = () => {
    if (!deleteTarget?.id) return;
    deleteMut.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  };

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Select a project
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Budget Hours is project-scoped. Choose a project from the top nav.
        </div>
      </div>
    );
  }

  // Gate fetch states at the page shell — BudgetHoursControlCenter has no loading props.
  if (isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="sb-dashboard-reference-page" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 16,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load budget hours
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
          {toUserErrorMessage(error, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  /* ── Canonical Budget Hours control center ── */
    // Apply search + category + over-budget filter for the DataTable.
    // Misses rows are always excluded from the table (they have their own panel).
    const commandFiltered = filterCommandBudgetRows(rows, {
      categoryFilter,
      overBudgetOnly,
      search,
    });

    const handleExportCsv = () => {
      const headers = [...BUDGET_HOURS_CSV_HEADERS];
      const exportRows = buildBudgetHoursCsvRows(commandFiltered);
      const csv = [headers, ...exportRows].map((row) => row.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "budget_hours.csv";
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <>
        <BudgetHoursControlCenter
          projectName={activeProject?.name || "Project"}
          rows={rows}
          wpsById={wpsById}
          search={search}
          onSearch={setSearch}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          overBudgetOnly={overBudgetOnly}
          onOverBudgetToggle={() => setOverBudgetOnly((v) => !v)}
          filteredRows={commandFiltered}
          onAddItem={openCreateScope}
          onSetUpTemplate={() => setPresetOpen(true)}
          onExport={handleExportCsv}
          onEditRow={openEditScope}
          onDeleteRow={requestDeleteRow}
          canCreate={canCreateScope}
          canEdit={canEditScope}
          canDelete={canDeleteScope}
        />
        <PresetDialog open={presetOpen} onClose={() => setPresetOpen(false)} onPick={applyPreset} />
        <ScopeItemFormModal
          open={scopeModalOpen}
          editTarget={scopeEditTarget}
          saving={createMut.isPending || updateMut.isPending}
          onClose={() => { setScopeModalOpen(false); setScopeEditTarget(null); }}
          onSave={handleScopeSave}
        />
        <DeleteDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteRow}
          title="Delete scope item?"
          description={
            deleteTarget?.scope_item
              ? `"${deleteTarget.scope_item}" will be removed from Budget Hours.`
              : "This scope item will be removed from Budget Hours."
          }
        />
      </>
    );
}
