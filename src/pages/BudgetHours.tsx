import { useMemo, useState } from "react";
import { useProjectContext } from "@/components/shared/ProjectContext";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { Button } from "@/components/design-system";
import { useProjectId } from "@/hooks/useProjectId";
import type { PresetDefinition } from "@/lib/budgetHourPresets";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { presentGeneratedFile } from "@/lib/native/fileExport";
import { usePermissions } from "@/services/permissions";
import BudgetHoursControlCenter from "./budgetHours/BudgetHoursControlCenter";
import {
  buildBudgetHoursCsv,
  buildScopeItemCreate,
  filterBudgetHourRows,
  type BudgetHourCategoryFilter,
  type BudgetHourPatch,
  type BudgetHourRow,
} from "./budgetHours/budgetHoursControlCenter.derive";
import PresetDialog from "./budgetHours/PresetDialog";
import ScopeItemFormModal from "./budgetHours/ScopeItemFormModal";
import { useBudgetHoursData } from "./budgetHours/useBudgetHoursData";

export default function BudgetHours() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const activeProjectName = (
    activeProject as { name?: string | null } | null
  )?.name;
  const { can } = usePermissions();
  const { rows, wpsById, rowsQuery, create, update, remove, applyPreset } =
    useBudgetHoursData(projectId);

  const [presetOpen, setPresetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<BudgetHourCategoryFilter>("All");
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeEditTarget, setScopeEditTarget] =
    useState<BudgetHourRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BudgetHourRow | null>(null);

  const canCreateScope = can("create", "budget_hour_item");
  const canEditScope = can("edit", "budget_hour_item");
  const canDeleteScope = can("delete", "budget_hour_item");

  const filteredRows = useMemo(
    () =>
      filterBudgetHourRows(rows, {
        search,
        category: categoryFilter,
        overBudgetOnly,
      }),
    [categoryFilter, overBudgetOnly, rows, search],
  );

  const openCreateScope = () => {
    setScopeEditTarget(null);
    setScopeModalOpen(true);
  };

  const openEditScope = (row: BudgetHourRow) => {
    setScopeEditTarget(row);
    setScopeModalOpen(true);
  };

  const closeScopeModal = () => {
    setScopeModalOpen(false);
    setScopeEditTarget(null);
  };

  const handleScopeSave = (patch: BudgetHourPatch) => {
    if (!projectId) return;
    if (scopeEditTarget) {
      update.mutate(
        { id: scopeEditTarget.id, patch },
        { onSuccess: closeScopeModal },
      );
      return;
    }

    create.mutate(buildScopeItemCreate(projectId, rows, patch), {
      onSuccess: () => setScopeModalOpen(false),
    });
  };

  const handlePresetPick = (preset: PresetDefinition) => {
    setPresetOpen(false);
    void applyPreset(preset);
  };

  const handleExportCsv = () => {
    const blob = new Blob([buildBudgetHoursCsv(filteredRows)], {
      type: "text/csv",
    });
    void presentGeneratedFile({
      blob,
      filename: "budget_hours.csv",
      title: "Budget hours",
    });
  };

  const confirmDeleteRow = () => {
    if (!deleteTarget) return;
    remove.mutate(
      { id: deleteTarget.id, scopeItem: deleteTarget.scope_item },
      { onSettled: () => setDeleteTarget(null) },
    );
  };

  if (!projectId) {
    return (
      <div
        className="sb-dashboard-reference-page"
        style={{ textAlign: "center", padding: "80px 24px" }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Select a project
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 8,
          }}
        >
          Budget Hours is project-scoped. Choose a project from the top nav.
        </div>
      </div>
    );
  }

  if (rowsQuery.isLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  if (rowsQuery.isError) {
    return (
      <div
        className="sb-dashboard-reference-page"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          gap: 16,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            margin: 0,
          }}
        >
          Couldn’t load budget hours
        </p>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-muted)",
            margin: 0,
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          {toUserErrorMessage(
            rowsQuery.error,
            "Something went wrong. Try again.",
          )}
        </p>
        <Button
          variant="outline"
          icon={null}
          disabled={false}
          title="Retry loading budget hours"
          aria-label="Retry loading budget hours"
          style={undefined}
          onClick={() => rowsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <BudgetHoursControlCenter
        projectName={activeProjectName || "Project"}
        rows={rows}
        wpsById={wpsById}
        search={search}
        onSearch={setSearch}
        categoryFilter={categoryFilter}
        onCategoryChange={(value) =>
          setCategoryFilter(value as BudgetHourCategoryFilter)
        }
        overBudgetOnly={overBudgetOnly}
        onOverBudgetToggle={() => setOverBudgetOnly((value) => !value)}
        filteredRows={filteredRows}
        onAddItem={openCreateScope}
        onSetUpTemplate={() => setPresetOpen(true)}
        onExport={handleExportCsv}
        onEditRow={openEditScope}
        onDeleteRow={setDeleteTarget}
        canCreate={canCreateScope}
        canEdit={canEditScope}
        canDelete={canDeleteScope}
      />
      <PresetDialog
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        onPick={handlePresetPick}
      />
      <ScopeItemFormModal
        open={scopeModalOpen}
        editTarget={scopeEditTarget}
        saving={create.isPending || update.isPending}
        onClose={closeScopeModal}
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
