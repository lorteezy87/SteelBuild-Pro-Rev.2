import WorkflowFetchState from "@/components/shared/WorkflowFetchState";
import type { ComponentType } from "react";
import type { RowWithAliases } from "@/api/supabaseClient";
import type { Drawing } from "@/hooks/useDrawings";
import type { DrawingSetRow } from "@/components/drawings/drawingsTableDerive";
import type {
  DrawingSetGroupLike,
  SubmittalsBySetId,
} from "./drawingActionHelpers";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import AttachRevisionToSubmittalModal from "@/components/submittals/AttachRevisionToSubmittalModal";
import DrawingsTable from "@/components/drawings/DrawingsTable";
import DrawingsGrid from "@/components/drawings/DrawingsGrid";
import {
  BulkActionsBar,
  DisciplineChips,
  FilterBar,
} from "@/components/drawings/DrawingsToolbar";
import AlertBanner from "@/components/drawings/AlertBanner";
import ActiveFilterPills from "@/components/drawings/ActiveFilterPills";
import DrawingContextMenu from "@/components/drawings/DrawingContextMenu";
import { mono, stageUpdatePatch, surface } from "@/components/drawings/drawingsConfig";
import { PhaseChevron } from "@/components/design-system";
import { stageToSubmittalStatus } from "@/lib/submittalStageMapping";
import { hubHref } from "@/pages/drawingSubmittalHub/hubLinks";
import DrawingsPageModals from "./DrawingsPageModals";
import DrawingsPageToolbar from "./DrawingsPageToolbar";
import { buildSubmittalNavigationSearch } from "./drawingActionHelpers";
import type { DrawingsPageController } from "./useDrawingsPageController";
import type { DrawingsPageData } from "./useDrawingsPageData";
import type { DrawingsPageState } from "./useDrawingsPageState";

interface DrawingsGridProps {
  drawings: Drawing[];
  drawingSets: DrawingSetRow[];
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onEdit: ((drawing: Drawing) => void) | null;
  onDelete: ((id: string) => void) | null;
  onAdvance: (drawing: Drawing) => void;
  onView: (drawing: Drawing) => void;
  onSetApproval: DrawingsPageController["openSetApproval"];
  onRenameSet: (group: DrawingSetGroupLike) => void;
  onDeleteSet: ((group: DrawingSetGroupLike) => void) | null;
  rfiMap: DrawingsPageData["rfiMap"];
  submittalsBySetId?: SubmittalsBySetId;
}

const TypedDrawingsGrid = DrawingsGrid as ComponentType<DrawingsGridProps>;

export default function DrawingsPageView({
  activeProject,
  embedded,
  revisionAiEnabled,
  canCreateDrawing,
  canEditDrawing,
  canDeleteDrawing,
  navigate,
  data,
  state,
  controller,
}: {
  activeProject: RowWithAliases<"projects"> | null | undefined;
  embedded: boolean;
  revisionAiEnabled: boolean;
  canCreateDrawing: boolean;
  canEditDrawing: boolean;
  canDeleteDrawing: boolean;
  navigate: (to: string) => void;
  data: DrawingsPageData;
  state: DrawingsPageState;
  controller: DrawingsPageController;
}) {
  const projectId = activeProject?.id;

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center" }}>
        <p style={{ ...mono, fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          SELECT A PROJECT TO VIEW DRAWINGS
        </p>
      </div>
    );
  }

  if (data.queryError || data.isLoading) {
    return <WorkflowFetchState label="Drawings" error={data.queryError} onRetry={() => { void data.refetch(); }} />;
  }

  const openSheetEditor = (drawing: Drawing) => {
    state.setEditing(drawing);
    state.setShowModal(true);
  };
  const openDrawing = (drawing: Drawing) =>
    navigate(`/DrawingViewer?id=${drawing.id}`);

  return (
    <div
      className={embedded ? undefined : "sb-dashboard-reference-page"}
      style={embedded
        ? { padding: 0, background: "transparent" }
        : { minHeight: "100vh", background: "var(--bg-page)" }}
      onClick={() => state.setContextMenu(null)}
    >
      <DrawingsPageToolbar
        embedded={embedded}
        projectName={activeProject?.name}
        stats={data.stats}
        filtered={data.filtered}
        canCreateDrawing={canCreateDrawing}
        drawingSetRecordsLength={data.drawingSetRecords.length}
        existingSetNamesLength={data.existingSetNames.length}
        stageFilter={state.stageFilter}
        onBackToHub={() => navigate(hubHref("drawings"))}
        onExportPkg={state.setExportPkgKind}
        onAddSheet={() => {
          state.setEditing(null);
          state.setShowModal(true);
        }}
        onOpenRevision={() => state.setRevisionOpen(true)}
        onOpenLogImport={() => state.setLogImportOpen(true)}
        onOpenUploadSet={() => state.setUploadSetOpen(true)}
        onStageFilter={state.setStageFilter}
      />

      {data.revisionAlerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 6 }}>
            REVISION CONTROL — {data.revisionAlerts.length} ALERT{data.revisionAlerts.length !== 1 ? "S" : ""}
          </div>
          {data.revisionAlerts.map((alert, index) => (
            <AlertBanner
              key={index}
              alert={alert}
              onFilter={(sheets: Drawing[]) =>
                state.setSelected(new Set(sheets.map((sheet) => sheet.id)))}
            />
          ))}
        </div>
      )}

      {!embedded && (
        <ErrorBoundary label="Stage Pipeline">
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-card)",
              padding: "12px 14px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                ...mono,
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "0.14em",
                marginBottom: 8,
              }}
            >
              SUBMITTAL STAGE PIPELINE
            </div>
            <PhaseChevron
              stages={data.stagePipeline.pipeStages}
              activeIdx={data.stagePipeline.activeIdx}
              showIcons={false}
            />
          </div>
        </ErrorBoundary>
      )}

      <ListTruncationNotice count={data.drawings.length} label="drawings" />

      <DisciplineChips
        discipline={state.discipline}
        setDiscipline={state.setDiscipline}
        disciplineCounts={data.disciplineCounts}
      />
      <FilterBar
        search={state.search}
        setSearch={state.setSearch}
        stageFilter={state.stageFilter}
        setStageFilter={state.setStageFilter}
        view={state.view}
        setView={state.setView}
      />
      <ActiveFilterPills
        search={state.search}
        discipline={state.discipline}
        stageFilter={state.stageFilter}
        setFilterLabel={data.setFilterLabel}
        onClearSearch={() => state.setSearch("")}
        onClearDiscipline={() => state.setDiscipline("ALL")}
        onClearStage={() => state.setStageFilter("ALL")}
        onClearSet={() => state.setSetFilterId(null)}
        onClearAll={() => {
          state.setSearch("");
          state.setDiscipline("ALL");
          state.setStageFilter("ALL");
          state.setSetFilterId(null);
        }}
      />

      {state.selected.size > 0 && (
        <BulkActionsBar
          selectedCount={state.selected.size}
          bulkStage={state.bulkStage}
          setBulkStage={state.setBulkStage}
          onApplyStage={controller.handleBulkStageApply}
          selectedSetName={data.selectedSetName}
          onSetApproval={controller.openSetApproval}
          onBulkEdit={() => state.setBulkEditOpen(true)}
          onBulkDelete={controller.handleBulkDelete}
          onClear={() => state.setSelected(new Set())}
        />
      )}

      <ErrorBoundary label="Drawings Content">
        {data.isLoading ? (
          <div style={{ padding: 48, textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>
            LOADING SHEETS…
          </div>
        ) : (
          data.filtered.length === 0
          && (
            data.drawingSetRecords.length === 0
            || (
              !!state.setFilterId
              && Object.keys(data.visibleSetMap).length === 0
            )
          )
        ) ? (
          <div style={{ ...surface, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>▦</div>
            <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em", margin: 0 }}>
              {data.drawings.length === 0 ? "NO SHEETS YET — ADD YOUR FIRST DRAWING" : "NO SHEETS MATCH FILTERS"}
            </p>
          </div>
        ) : state.view === "list" ? (
          <DrawingsTable
            drawings={data.filtered}
            selected={state.selected}
            onToggleSelect={controller.toggleSelect}
            onToggleAll={controller.toggleSelectAll}
            onEdit={canEditDrawing ? openSheetEditor : null}
            onDelete={canDeleteDrawing ? controller.handleDelete : null}
            onAdvance={controller.handleAdvanceStage}
            onView={openDrawing}
            setContextMenu={state.setContextMenu}
            onSetApproval={controller.openSetApproval}
            onDeleteSet={canDeleteDrawing ? controller.handleDeleteSet : null}
            onRenameSet={controller.openRenameSet}
            onMarkTitleblock={controller.openMarkTitleblock}
            onPackageReport={revisionAiEnabled ? state.setReportSet : null}
            rfiMap={data.rfiMap}
            drawingSetMap={data.visibleSetMap}
            submittalsBySetId={data.submittalsBySetId}
          />
        ) : (
          <TypedDrawingsGrid
            drawings={data.filtered}
            drawingSets={Object.values(data.visibleSetMap)}
            selected={state.selected}
            onToggleSelect={controller.toggleSelect}
            onEdit={canEditDrawing ? openSheetEditor : null}
            onDelete={canDeleteDrawing ? controller.handleDelete : null}
            onAdvance={controller.handleAdvanceStage}
            onView={openDrawing}
            onSetApproval={controller.openSetApproval}
            onRenameSet={controller.openRenameSet}
            onDeleteSet={canDeleteDrawing ? controller.handleDeleteSet : null}
            rfiMap={data.rfiMap}
          />
        )}
      </ErrorBoundary>

      <DrawingContextMenu
        contextMenu={state.contextMenu}
        contextRef={state.contextRef}
        onView={openDrawing}
        onEdit={canEditDrawing ? openSheetEditor : null}
        onAdvance={controller.handleAdvanceStage}
        onSetApproval={controller.openSetApproval}
        onCompareRevisions={state.setCompareDrawing}
        onDelete={canDeleteDrawing ? controller.handleDelete : null}
        onDismiss={() => state.setContextMenu(null)}
      />

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
        onLegacyAdvance={({ drawingId, targetStage }: {
          drawingId: string;
          targetStage: string;
        }) => {
          controller.updateMut.mutate({
            id: drawingId,
            ...stageUpdatePatch(targetStage),
          });
          state.setAdvanceTarget(null);
        }}
        onViaSubmittal={({ setId, targetStage }: {
          setId: string | null;
          targetStage: string;
        }) => {
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
