/**
 * DrawingRegisterActions — the editing actions that used to live only on the
 * hidden /Drawings "full editor".
 *
 * Styled with the hub's own cmd-btn vocabulary rather than the standalone
 * page's CommandBar, because the hub tab already has a header; a second one
 * stacked inside the panel was half the reason the two surfaces read as
 * different pages.
 */

import { useEffect, useRef, useState } from "react";
import { Download, FileUp, MoreHorizontal, Plus, RefreshCw, Table2, Upload } from "lucide-react";

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
  onOpenIntake: () => void;
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
  onOpenIntake,
  onBulkEdit,
  onExportTransmittal,
  onExportPkg,
}: DrawingRegisterActionsProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    if (!moreOpen || !focusOnOpen.current) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    const target = focusOnOpen.current === "last" ? items?.[items.length - 1] : items?.[0];
    focusOnOpen.current = null;
    target?.focus();
  }, [moreOpen]);

  const runAndClose = (action: () => void) => {
    setMoreOpen(false);
    triggerRef.current?.focus();
    action();
  };
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
      {canEditDrawing && (
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
      )}
      {/* Selection is the one condition that promotes bulk edit into the
          primary bar. It never acts on hidden filtered sheets. */}
      {canEditDrawing && selectedCount > 0 && (
        <button
          type="button"
          className="cmd-btn cmd-btn--ghost"
          style={btn}
          onClick={onBulkEdit}
          title={`Edit ${selectedCount} selected sheet(s)`}
        >
          <Table2 size={13} /> Bulk edit ({selectedCount})
        </button>
      )}

      <span style={{ flex: 1 }} />
      <div
        className="drawing-actions__more"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMoreOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && moreOpen) {
            event.preventDefault();
            setMoreOpen(false);
            triggerRef.current?.focus();
            return;
          }
          if (!moreOpen && event.target === triggerRef.current && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            focusOnOpen.current = event.key === "ArrowUp" ? "last" : "first";
            setMoreOpen(true);
            return;
          }
          if (!moreOpen || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
          const index = items.indexOf(event.target as HTMLButtonElement);
          if (index < 0 || items.length === 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0
            : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (index + 1) % items.length
                : (index - 1 + items.length) % items.length;
          items[next]?.focus();
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="cmd-btn cmd-btn--ghost"
          style={btn}
          aria-label="More drawing actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={(event) => {
            if (!moreOpen && event.detail === 0) focusOnOpen.current = "first";
            setMoreOpen((open) => !open);
          }}
        >
          <MoreHorizontal size={14} /> More actions
        </button>
        {moreOpen && (
          <div ref={menuRef} className="drawing-actions__menu" role="menu" aria-label="Drawing actions">
            {canCreateDrawing && (
              <button type="button" role="menuitem" onClick={() => runAndClose(onAddSheet)}>
                <Plus size={14} /> Add sheet
              </button>
            )}
            {canCreateDrawing && (
              <button
                type="button"
                role="menuitem"
                title="Import a detailer Drawing Complete / Submittal Log (.xls)"
                onClick={() => runAndClose(onOpenLogImport)}
              >
                <FileUp size={14} /> Import detailer log
              </button>
            )}
            {canCreateDrawing && (
              <button type="button" role="menuitem" onClick={() => runAndClose(onOpenIntake)}>
                <FileUp size={14} /> Review PDF intake
              </button>
            )}
            {canEditDrawing && selectedCount === 0 && (
              <button type="button" role="menuitem" disabled title="Select sheets in the register first">
                <Table2 size={14} /> Bulk edit · select sheets first
              </button>
            )}
            <span className="drawing-actions__menu-label">Export packets</span>
            <button type="button" role="menuitem" onClick={() => runAndClose(onExportTransmittal)}>
              <Download size={14} /> Transmittal packet
            </button>
            <button type="button" role="menuitem" onClick={() => runAndClose(() => onExportPkg("fab_release"))}>
              <Download size={14} /> Fab release packet
            </button>
            <button type="button" role="menuitem" onClick={() => runAndClose(() => onExportPkg("turnover"))}>
              <Download size={14} /> Turnover packet
            </button>
            <button type="button" role="menuitem" onClick={() => runAndClose(() => onExportPkg("claims"))}>
              <Download size={14} /> Claims packet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
