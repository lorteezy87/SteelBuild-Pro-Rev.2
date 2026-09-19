/**
 * DrawingRegisterActions — the editing actions that used to live only on the
 * hidden /Drawings "full editor".
 *
 * Styled with the hub's own cmd-btn vocabulary rather than the standalone
 * page's CommandBar, because the hub tab already has a header; a second one
 * stacked inside the panel was half the reason the two surfaces read as
 * different pages.
 */

import { Download, FileUp, Plus, RefreshCw, Table2, Upload } from "lucide-react";

export interface DrawingRegisterActionsProps {
  canCreateDrawing: boolean;
  canEditDrawing: boolean;
  /** Disables "New revision" when the project has no set to revise yet. */
  hasSets: boolean;
  selectedCount: number;
  onAddSheet: () => void;
  onOpenUploadSet: () => void;
  onOpenRevision: () => void;
  onOpenLogImport: () => void;
  onBulkEdit: () => void;
  onExportTransmittal: () => void;
  onExportPkg: (kind: string) => void;
}

const btn: React.CSSProperties = { fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 };

export default function DrawingRegisterActions({
  canCreateDrawing,
  canEditDrawing,
  hasSets,
  selectedCount,
  onAddSheet,
  onOpenUploadSet,
  onOpenRevision,
  onOpenLogImport,
  onBulkEdit,
  onExportTransmittal,
  onExportPkg,
}: DrawingRegisterActionsProps) {
  return (
    <div
      className="cmd-filterbar"
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      {canCreateDrawing && (
        <button type="button" className="cmd-btn cmd-btn--primary" style={btn} onClick={onOpenUploadSet}>
          <Upload size={13} /> Upload set
        </button>
      )}
      <button
        type="button"
        className="cmd-btn cmd-btn--ghost"
        style={btn}
        onClick={onOpenRevision}
        disabled={!hasSets}
        title={hasSets ? "Upload a new revision of an existing set" : "Upload a set first"}
      >
        <RefreshCw size={13} /> New revision
      </button>
      {canCreateDrawing && (
        <button type="button" className="cmd-btn cmd-btn--ghost" style={btn} onClick={onAddSheet}>
          <Plus size={13} /> Add sheet
        </button>
      )}
      {canCreateDrawing && (
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          style={btn}
          onClick={onOpenLogImport}
          title="Import a detailer Drawing Complete / Submittal Log (.xls)"
        >
          <FileUp size={13} /> Import log
        </button>
      )}

      {/* Bulk edit only means anything with a selection, and the selection
          lives in the sheet table — so the button states what is selected
          rather than silently doing nothing. */}
      {canEditDrawing && (
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          style={btn}
          onClick={onBulkEdit}
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? "Select sheets in the table first" : `Edit ${selectedCount} selected sheet(s)`}
        >
          <Table2 size={13} /> Bulk edit{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      )}

      <span style={{ flex: 1 }} />

      <button type="button" className="cmd-btn cmd-btn--ghost" style={btn} onClick={onExportTransmittal}>
        <Download size={13} /> Transmittal
      </button>
      <button type="button" className="cmd-btn cmd-btn--ghost" style={btn} onClick={() => onExportPkg("fab_release")}>
        <Download size={13} /> Fab release
      </button>
      <button type="button" className="cmd-btn cmd-btn--ghost" style={btn} onClick={() => onExportPkg("turnover")}>
        <Download size={13} /> Turnover
      </button>
      <button type="button" className="cmd-btn cmd-btn--ghost" style={btn} onClick={() => onExportPkg("claims")}>
        <Download size={13} /> Claims
      </button>
    </div>
  );
}
