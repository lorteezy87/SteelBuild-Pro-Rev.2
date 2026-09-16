/**
 * BoardToolbar — tools, zoom, undo, and the sync truth.
 *
 * The status block is the part that matters most. A board that keeps working
 * offline has to say which of the two states it is in, because they look
 * identical from the canvas: everything responds either way. So it reports
 * connectivity, the size of the unsynced backlog, and any storage failure, in
 * words rather than an icon.
 */

import type { BoardColor } from "@/lib/board/types";
import { BOARD_COLORS } from "@/lib/board/types";
import { boardFill, boardStroke } from "@/lib/board/palette";
import type { SyncState } from "@/lib/board/storage";
import { BOARD_TOOLS, TOOL_GLYPH, TOOL_LABEL, type BoardTool } from "./tools";

export interface BoardToolbarProps {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  color: BoardColor;
  onColorChange: (color: BoardColor) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddPhoto: () => void;
  onAddLink: () => void;
  onAddSheet: () => void;
  sync: SyncState;
  online: boolean;
  storageError: string | null;
  scrubbing: boolean;
}

function statusModifier(sync: SyncState, online: boolean): string {
  if (!online) return "offline";
  if (sync.status === "error") return "error";
  if (sync.status === "synced") return "synced";
  return "";
}

export default function BoardToolbar(props: BoardToolbarProps) {
  const { sync, online, storageError, scrubbing } = props;
  const modifier = statusModifier(sync, online);

  return (
    <>
      <div className="sbp-toolbar" role="toolbar" aria-label="Board tools">
        <div className="sbp-toolbar__group">
          {BOARD_TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              className={`sbp-btn${props.tool === tool ? " sbp-btn--active" : ""}`}
              aria-pressed={props.tool === tool}
              onClick={() => props.onToolChange(tool)}
              disabled={scrubbing}
            >
              <span aria-hidden="true">{TOOL_GLYPH[tool]}</span>
              {TOOL_LABEL[tool]}
            </button>
          ))}
        </div>

        <span className="sbp-toolbar__sep" />

        <div className="sbp-toolbar__group" role="group" aria-label="Card colour">
          {BOARD_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`sbp-btn sbp-btn--sm${props.color === color ? " sbp-btn--active" : ""}`}
              aria-pressed={props.color === color}
              aria-label={`${color} cards`}
              title={color}
              onClick={() => props.onColorChange(color)}
              style={{ background: boardFill(color), borderColor: boardStroke(color) }}
            >
              <span aria-hidden="true" style={{ color: boardStroke(color) }}>
                ●
              </span>
            </button>
          ))}
        </div>

        <span className="sbp-toolbar__sep" />

        <div className="sbp-toolbar__group">
          <button type="button" className="sbp-btn" onClick={props.onAddPhoto} disabled={scrubbing}>
            Photo
          </button>
          <button type="button" className="sbp-btn" onClick={props.onAddLink} disabled={scrubbing}>
            Link
          </button>
          <button type="button" className="sbp-btn" onClick={props.onAddSheet} disabled={scrubbing}>
            Sheet
          </button>
        </div>

        <span className="sbp-toolbar__sep" />

        <div className="sbp-toolbar__group">
          <button type="button" className="sbp-btn sbp-btn--sm" onClick={props.onZoomOut} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="sbp-btn sbp-btn--sm" onClick={props.onZoomIn} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="sbp-btn sbp-btn--sm" onClick={props.onFit}>
            Fit
          </button>
        </div>

        <span className="sbp-toolbar__sep" />

        <div className="sbp-toolbar__group">
          <button
            type="button"
            className="sbp-btn sbp-btn--sm"
            onClick={props.onUndo}
            disabled={!props.canUndo}
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            type="button"
            className="sbp-btn sbp-btn--sm"
            onClick={props.onRedo}
            disabled={!props.canRedo}
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <div className="sbp-status" data-testid="board-sync-status">
          <span className={`sbp-status__dot${modifier ? ` sbp-status__dot--${modifier}` : ""}`} aria-hidden="true" />
          <span>{online ? sync.message : "Offline — working from this device."}</span>
        </div>
      </div>

      {storageError ? (
        <div className="sbp-alert" role="alert" data-testid="board-storage-error">
          This board could not be saved: {storageError}
        </div>
      ) : null}
    </>
  );
}
