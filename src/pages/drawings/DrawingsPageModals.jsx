/**
 * Modal / dialog host for the Drawings page.
 * Extracted from Drawings.jsx — presentation wiring only; no behavior change.
 * Does not use <form> or Radix Dialog (DeleteDialog / feature modals own chrome).
 */
import React from "react";
import { EMPTY_FORM } from "@/components/drawings/drawingsConfig";
import SheetFormModal from "@/components/drawings/SheetFormModal";
import SetApprovalModal from "@/components/drawings/SetApprovalModal";
import AdvanceStageDialog from "@/components/drawings/AdvanceStageDialog";
import RenameSetModal from "@/components/drawings/RenameSetModal";
import TitleblockMarkerModal from "@/components/drawings/TitleblockMarkerModal";
import BulkEditModal from "@/components/drawings/BulkEditModal";
import DrawingSetUploadModal from "@/components/drawings/DrawingSetUploadModal";
import DrawingLogImportModal from "@/components/drawings/DrawingLogImportModal";
import RevisionUploadModal from "@/components/drawings/RevisionUploadModal";
import RevisionCompareModal from "@/components/drawings/RevisionCompareModal";
import RevisionImpactReportModal from "@/components/drawings/RevisionImpactReportModal";
import ExportFabReleaseModal from "@/components/drawings/ExportFabReleaseModal";
import DeleteDialog from "@/components/shared/DeleteDialog";

export default function DrawingsPageModals({
  showModal,
  editing,
  saving,
  existingSetNames,
  onSave,
  onCloseSheetModal,
  bulkEditOpen,
  onCloseBulkEdit,
  onBulkEdit,
  selectedCount,
  advanceTarget,
  onCloseAdvance,
  onLegacyAdvance,
  onViaSubmittal,
  approvalSet,
  onCloseApproval,
  onConfirmApproval,
  savingApproval,
  renameSet,
  onCloseRename,
  onSaveRename,
  savingRename,
  markerSet,
  onCloseMarker,
  onMarkerSaved,
  uploadSetOpen,
  onCloseUploadSet,
  onUploadComplete,
  activeProject,
  drawings,
  logImportOpen,
  projectId,
  onCloseLogImport,
  onLogImported,
  revisionOpen,
  onCloseRevision,
  onRevisionComplete,
  drawingSetRecords,
  compareDrawing,
  onCloseCompare,
  reportSet,
  onCloseReport,
  exportPkgKind,
  onCloseExport,
  confirmState,
  onCloseConfirm,
  onConfirmDelete,
}) {
  return (
    <>
      {showModal && (
        <SheetFormModal
          initial={editing || EMPTY_FORM}
          onSave={onSave}
          onClose={onCloseSheetModal}
          saving={saving}
          existingSetNames={existingSetNames}
        />
      )}

      <BulkEditModal
        open={bulkEditOpen}
        onClose={onCloseBulkEdit}
        onApply={onBulkEdit}
        selectedCount={selectedCount}
      />

      <AdvanceStageDialog
        open={!!advanceTarget}
        currentStage={advanceTarget?.currentStage}
        targetStage={advanceTarget?.targetStage}
        drawingId={advanceTarget?.drawingId}
        setId={advanceTarget?.setId}
        allowLegacy={advanceTarget?.allowLegacy}
        onClose={onCloseAdvance}
        onLegacy={onLegacyAdvance}
        onViaSubmittal={onViaSubmittal}
      />

      <SetApprovalModal
        open={!!approvalSet}
        onClose={onCloseApproval}
        setName={approvalSet?.setName || ""}
        sheetCount={approvalSet?.sheets?.length || 0}
        existingRevision={approvalSet?.sheets?.[0]?.revision_number || ""}
        onConfirm={onConfirmApproval}
        saving={savingApproval}
      />

      <RenameSetModal
        open={!!renameSet}
        initialName={renameSet?.setName || ""}
        onClose={onCloseRename}
        onSave={onSaveRename}
        saving={savingRename}
      />

      {markerSet && (
        <TitleblockMarkerModal
          set={markerSet}
          onClose={onCloseMarker}
          onSaved={onMarkerSaved}
        />
      )}

      <DrawingSetUploadModal
        open={uploadSetOpen}
        onClose={onCloseUploadSet}
        onComplete={onUploadComplete}
        activeProject={activeProject}
        existingDrawings={drawings}
        existingSetNames={existingSetNames}
      />

      <DrawingLogImportModal
        open={logImportOpen}
        projectId={projectId}
        projectName={activeProject?.name}
        onClose={onCloseLogImport}
        onImported={onLogImported}
      />

      {/* New Revision flow — marks prior sheets is_superseded=true and
          inserts the replacement revision under the same set. F14. */}
      <RevisionUploadModal
        open={revisionOpen}
        onClose={onCloseRevision}
        onComplete={onRevisionComplete}
        activeProject={activeProject}
        drawingSets={drawingSetRecords}
      />

      {/* Overlay compare — old revision red / new revision blue, from the
          per-sheet slip-sheet history. Opened via the row context menu. */}
      {compareDrawing && (
        <RevisionCompareModal
          open={!!compareDrawing}
          onClose={onCloseCompare}
          drawing={compareDrawing}
        />
      )}

      {/* Package-level AI Revision Impact Report — launched from a set's
          "Impact Report" action (flag-gated). */}
      {reportSet && (
        <RevisionImpactReportModal
          open
          onClose={onCloseReport}
          set={reportSet}
          projectId={projectId}
        />
      )}

      {/* Sprint 4 — package exports (fab release / turnover / claims). One
          shared modal switches behavior based on `kind`. */}
      <ExportFabReleaseModal
        open={!!exportPkgKind}
        onClose={onCloseExport}
        kind={exportPkgKind || "fab_release"}
        project={activeProject}
        drawings={drawings}
      />

      {/* F18: styled confirm replacing window.confirm() for destructive
          actions. Sits on top of every list/set/bulk delete path. */}
      <DeleteDialog
        open={!!confirmState}
        onClose={onCloseConfirm}
        onConfirm={onConfirmDelete}
        title={confirmState?.title}
        description={confirmState?.description}
      />
    </>
  );
}
