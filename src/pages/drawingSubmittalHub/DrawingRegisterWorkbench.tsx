/**
 * DrawingRegisterWorkbench — the Drawing Register tab's editing shell.
 *
 * WHY THIS EXISTS. Set upload, revision upload, sheet create/edit, bulk edit,
 * rename, titleblock mapping, log import and the export packages used to live
 * ONLY on /Drawings, an unlinked page reachable from two "Open full editor ↗"
 * buttons. A user reading the register had to leave it, act somewhere else,
 * and come back — and nothing on either surface said which register was
 * authoritative. The actions now sit above the register itself and /Drawings
 * redirects here.
 *
 * It reuses the page's existing, tested hooks unchanged —
 * useDrawingsPageState → useDrawingsPageData → useDrawingsPageController —
 * so the engine moved rather than being rewritten. In particular the stage
 * gates (validateStageTransition / classifyDrawingStageMutation inside
 * handleBulkEdit) come along intact; they are what stop a bulk edit bypassing
 * submittal approval.
 *
 * The modal host is the page's own DrawingsPageModals, so every dialog behaves
 * exactly as it did before the move.
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePermissions } from "@/services/permissions";
import { useFlag } from "@/hooks/useFeatureFlag";
import { exportTransmittal } from "@/components/drawings/drawingsUtils";
import { stageUpdatePatch } from "@/components/drawings/drawingsConfig";
import { stageToSubmittalStatus } from "@/lib/submittalStageMapping";
import AttachRevisionToSubmittalModal from "@/components/submittals/AttachRevisionToSubmittalModal";
import DrawingsPageModals from "@/pages/drawings/DrawingsPageModals";
import { useDrawingsPageState } from "@/pages/drawings/useDrawingsPageState";
import { useDrawingsPageData } from "@/pages/drawings/useDrawingsPageData";
import { useDrawingsPageController } from "@/pages/drawings/useDrawingsPageController";
import { buildSubmittalNavigationSearch, toggleSelectAllIds } from "@/pages/drawings/drawingActionHelpers";
import type { DrawingsPageFilters } from "@/pages/drawings/drawingsPageDerive";
import DrawingRegisterActions from "./DrawingRegisterActions";

export interface DrawingRegisterWorkbenchProps {
  projectId: string | null;
  activeProject?: { id?: string | null; name?: string | null } | null;
  /**
   * The register body. Receives the live selection so a table that supports
   * it can drive Bulk edit; bodies that don't simply ignore both.
   */
  children: (api: {
    selected: ReadonlySet<string>;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: (ids: string[]) => void;
  }) => ReactNode;
}

export default function DrawingRegisterWorkbench({
  projectId,
  activeProject,
  children,
}: DrawingRegisterWorkbenchProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { can } = usePermissions();
  const workdayDues = useFlag("submittal_workday_dues");

  const canCreateDrawing = can("create", "drawing");
  const canEditDrawing = can("edit", "drawing");

  const state = useDrawingsPageState(searchParams);

  // The register body owns its own filtering and display; this shell only
  // needs the unfiltered model for the actions (export scope, set list,
  // existing names). Keeping the filters inert here avoids two competing
  // filter bars in one panel.
  const filters = useMemo<DrawingsPageFilters>(
    () => ({ search: "", discipline: "ALL", stageFilter: "ALL", setFilterId: null }),
    [],
  );

  const data = useDrawingsPageData({
    projectId,
    filters,
    selected: state.selected,
    workdayDues,
  });

  const controller = useDrawingsPageController({
    // The hub passes the project as the narrow {id, name} shape its panels
    // share, while the controller's signature names the full projects row. It
    // only reads id and name; cast at the boundary rather than widening the
    // hub's prop type through a dozen components.
    activeProject: activeProject as Parameters<typeof useDrawingsPageController>[0]["activeProject"],
    projectId,
    queryClient,
    navigate,
    data,
    state,
  });

  const hasSets =
    (data.drawingSetRecords?.length ?? 0) > 0 || (data.existingSetNames?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The register below reads its own query (drawing_register_view) and
          renders its own states, so a failure HERE does not blank the page —
          it disables the actions. Say so rather than leaving "New revision"
          greyed out with no reason, which reads as "this project has no sets". */}
      {data.queryError ? (
        <div
          role="alert"
          style={{
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            padding: "8px 14px", borderRadius: 8,
            border: "1px solid var(--status-error)",
            background: "var(--bg-surface-low)",
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))" }}>
            Couldn&rsquo;t load drawing sets, so the editing actions are unavailable. The
            register below is unaffected.
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            style={{ fontSize: 12, whiteSpace: "nowrap" }}
            onClick={() => { void data.refetch(); }}
          >
            Retry
          </button>
        </div>
      ) : (
      <DrawingRegisterActions
        canCreateDrawing={canCreateDrawing}
        canEditDrawing={canEditDrawing}
        hasSets={hasSets}
        selectedCount={state.selected.size}
        onAddSheet={() => {
          state.setEditing(null);
          state.setShowModal(true);
        }}
        onOpenUploadSet={() => state.setUploadSetOpen(true)}
        onOpenRevision={() => state.setRevisionOpen(true)}
        onOpenLogImport={() => state.setLogImportOpen(true)}
        onBulkEdit={() => state.setBulkEditOpen(true)}
        onExportTransmittal={() => exportTransmittal(data.filtered, activeProject?.name ?? undefined)}
        onExportPkg={(kind) => state.setExportPkgKind(kind)}
      />
      )}

      {children({
        selected: state.selected,
        onToggleSelect: controller.toggleSelect,
        // NOT controller.toggleSelectAll: that one selects the controller's own
        // `filtered` list, which this shell deliberately leaves unfiltered. The
        // register below has its own search and status filters, so select-all
        // has to be told which rows are actually on screen — otherwise ticking
        // the header box would quietly select sheets the user cannot see and
        // Bulk edit would write to them.
        onToggleSelectAll: (ids: string[]) =>
          state.setSelected((previous) => toggleSelectAllIds(previous, ids)),
      })}

      <DrawingsPageModals
        showModal={state.showModal}
        editing={state.editing}
        saving={state.saving}
        existingSetNames={data.existingSetNames}
        onSave={controller.handleSave}
        onCloseSheetModal={() => {
          state.setShowModal(false);
          state.setEditing(null);
        }}
        bulkEditOpen={state.bulkEditOpen}
        onCloseBulkEdit={() => state.setBulkEditOpen(false)}
        onBulkEdit={controller.handleBulkEdit}
        selectedCount={state.selected.size}
        advanceTarget={state.advanceTarget}
        onCloseAdvance={() => state.setAdvanceTarget(null)}
        onLegacyAdvance={({ drawingId, targetStage }: { drawingId: string; targetStage: string }) => {
          controller.updateMut.mutate({ id: drawingId, ...stageUpdatePatch(targetStage) });
          state.setAdvanceTarget(null);
        }}
        onViaSubmittal={({ setId, targetStage }: { setId: string | null; targetStage: string }) => {
          const mapped = stageToSubmittalStatus(targetStage);
          navigate(`/Submittals${buildSubmittalNavigationSearch({
            setId,
            mapped,
            submittals: data.submittals,
          })}`);
          state.setAdvanceTarget(null);
        }}
        approvalSet={state.approvalSet}
        onCloseApproval={() => state.setApprovalSet(null)}
        onConfirmApproval={controller.handleSetApproval}
        savingApproval={state.savingApproval}
        renameSet={state.renameSet}
        onCloseRename={() => state.setRenameSet(null)}
        onSaveRename={controller.handleRenameSet}
        savingRename={state.savingRename}
        markerSet={state.markerSet}
        onCloseMarker={() => state.setMarkerSet(null)}
        onMarkerSaved={(): void => {
          void controller.invalidate();
        }}
        uploadSetOpen={state.uploadSetOpen}
        onCloseUploadSet={() => state.setUploadSetOpen(false)}
        onUploadComplete={controller.handleDrawingImportComplete}
        activeProject={activeProject}
        drawings={data.drawings}
        logImportOpen={state.logImportOpen}
        projectId={projectId}
        onCloseLogImport={() => state.setLogImportOpen(false)}
        onLogImported={controller.handleDrawingImportComplete}
        revisionOpen={state.revisionOpen}
        onCloseRevision={() => state.setRevisionOpen(false)}
        onRevisionComplete={controller.handleRevisionComplete}
        drawingSetRecords={data.drawingSetRecords}
        compareDrawing={state.compareDrawing}
        onCloseCompare={() => state.setCompareDrawing(null)}
        reportSet={state.reportSet}
        onCloseReport={() => state.setReportSet(null)}
        exportPkgKind={state.exportPkgKind}
        onCloseExport={() => state.setExportPkgKind(null)}
        confirmState={state.confirmState}
        onCloseConfirm={() => state.setConfirmState(null)}
        onConfirmDelete={() => {
          const run = state.confirmState?.run;
          state.setConfirmState(null);
          if (run) void run();
        }}
      />

      {state.attachPrompt && (
        <AttachRevisionToSubmittalModal
          open
          setName={state.attachPrompt.setName}
          revisionLabel={state.attachPrompt.revisionLabel}
          candidates={state.attachPrompt.candidates}
          busy={state.attachBusy}
          onDismiss={() => state.setAttachPrompt(null)}
          onAttach={controller.handleAttachRevision}
        />
      )}
    </div>
  );
}
