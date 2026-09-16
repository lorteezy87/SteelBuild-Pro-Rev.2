/**
 * Subcontractor Command Center — an infinite planning board for the jobsite.
 *
 * The surface between "what we scribbled on the tailgate" and "what is in the
 * schedule": notes, photos, handwriting and tasks laid out on an unbounded
 * canvas, pinned to drawing sheets, wired together with labelled connectors, and
 * scheduled on a touch timeline.
 *
 * The page is composition and wiring only. Board state is `useBoardController`;
 * every rule about what a board *is* lives in `src/lib/board/*` and is unit
 * tested there.
 *
 * ## What this page does not do
 *
 * It does not write to `schedule_tasks`, `rfis` or `daily_logs`. Board records
 * are the board's own (see `lib/board/types.ts`), and the assistant produces
 * drafts to paste rather than filed records — an official RFI number comes from
 * the database sequence, and minting one from an unreviewed board draft would
 * put an unread question into the project record.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import "@/styles/command.css";
import "@/styles/board.css";
import { useCommandSkin } from "@/components/command/useCommandSkin";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useAuth } from "@/lib/AuthContext";
import BoardCanvas from "@/components/board/BoardCanvas";
import BoardMinimap from "@/components/board/BoardMinimap";
import BoardToolbar from "@/components/board/BoardToolbar";
import GanttLane from "@/components/board/GanttLane";
import NodeInspector from "@/components/board/NodeInspector";
import AssistantPanel from "@/components/board/AssistantPanel";
import TimeMachine from "@/components/board/TimeMachine";
import type { BoardTool } from "@/components/board/tools";
import { resolveNodeRect } from "@/lib/board/document";
import {
  createBookmark,
  createLinkNode,
  createOverlay,
  createPhotoNode,
  newId,
} from "@/lib/board/factory";
import { boundsOf, padRect } from "@/lib/board/geometry";
import { getAsset, putAsset, storageErrorMessage } from "@/lib/board/storage";
import type { BoardColor } from "@/lib/board/types";
import { centerOn, fitToRect, screenToWorld, zoomAt, type ViewportSize } from "@/lib/board/viewport";
import { useBoardController } from "./subcontractorCommandCenter/useBoardController";

/** World size a dropped sheet is placed at — roughly a D-size sheet at 1:1. */
const SHEET_SIZE = { w: 1600, h: 1100 };

export default function SubcontractorCommandCenter() {
  useCommandSkin();
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const auth = useAuth() as { user?: { email?: string | null; full_name?: string | null } | null };

  const board = useBoardController({ projectId });
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState<BoardColor>("neutral");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 1024, height: 700 });
  const [rfiNodeId, setRfiNodeId] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);

  const photoInput = useRef<HTMLInputElement | null>(null);
  const sheetInput = useRef<HTMLInputElement | null>(null);

  const { doc, dispatch, viewport, setViewport, scrubbing } = board;

  const project = activeProject as { name?: string | null } | null;
  const projectName = project?.name || "Portfolio";
  const preparedBy = auth?.user?.full_name || auth?.user?.email || "Field";

  // Photo and sheet bytes live in this device's asset store. Resolving them
  // through a memo keeps a board of 40 photos from re-reading storage on every
  // pointer move.
  const assetUrls = useMemo(() => {
    const ids = new Set<string>();
    for (const node of doc.nodes) if (node.kind === "photo") ids.add(node.asset_id);
    for (const overlay of doc.overlays) ids.add(overlay.asset_id);
    const map = new Map<string, string | null>();
    for (const id of ids) map.set(id, getAsset(id));
    return map;
  }, [doc.nodes, doc.overlays]);

  const assetUrl = useCallback((assetId: string) => assetUrls.get(assetId) ?? null, [assetUrls]);

  /** Centre of the canvas, in world units — where a placed object goes. */
  const canvasCentre = useCallback(
    () => screenToWorld(viewport, { x: size.width / 2, y: size.height / 2 }),
    [viewport, size],
  );

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("That file could not be read."));
      reader.readAsDataURL(file);
    });

  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const assetId = newId("asset");
      // Reported, not swallowed: a photo that silently failed to store leaves a
      // card that is empty on the next open.
      const stored = storageErrorMessage(putAsset(assetId, dataUrl));
      if (stored) {
        setAssetError(stored);
        return;
      }
      setAssetError(null);
      const node = createPhotoNode(canvasCentre(), assetId, file.name);
      dispatch({ type: "add_node", node }, { label: "Added photo" });
      board.setSelection([node.id]);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  const onSheetPicked = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const assetId = newId("asset");
      const stored = storageErrorMessage(putAsset(assetId, dataUrl));
      if (stored) {
        setAssetError(stored);
        return;
      }
      setAssetError(null);
      const centre = canvasCentre();
      // The sheet number is taken from the file name, which on a real drawing
      // set is "S-301.png" or similar. The inspector is where it gets corrected;
      // guessing is better than leaving an RFI with nothing to cite.
      const sheetNumber = file.name.replace(/\.[^.]+$/, "");
      const overlay = createOverlay(assetId, file.name, sheetNumber, {
        x: centre.x - SHEET_SIZE.w / 2,
        y: centre.y - SHEET_SIZE.h / 2,
        w: SHEET_SIZE.w,
        h: SHEET_SIZE.h,
      });
      dispatch({ type: "add_overlay", overlay }, { label: `Added sheet ${sheetNumber}` });
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  const addLink = () => {
    // Created empty and selected: the URL is typed in the inspector rather than
    // in a blocking prompt, which on a tablet hides the board behind the keyboard.
    const node = createLinkNode(canvasCentre(), "", "New link");
    dispatch({ type: "add_node", node }, { label: "Added link" });
    board.setSelection([node.id]);
  };

  const fitToContent = () => {
    const bounds = boundsOf([
      ...doc.nodes.map((node) => resolveNodeRect(doc, node)),
      ...doc.overlays.map((overlay) => overlay.rect),
    ]);
    if (!bounds) return;
    setViewport(fitToRect(padRect(bounds, 80), size));
  };

  const zoomBy = (factor: number) =>
    setViewport((prev) => zoomAt(prev, { x: size.width / 2, y: size.height / 2 }, factor));

  return (
    <div className="sbp-board" data-skin="command" data-testid="subcontractor-command-center">
      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onFit={fitToContent}
        onUndo={board.undo}
        onRedo={board.redo}
        canUndo={board.canUndo}
        canRedo={board.canRedo}
        onAddPhoto={() => photoInput.current?.click()}
        onAddLink={addLink}
        onAddSheet={() => sheetInput.current?.click()}
        sync={board.sync}
        online={board.online}
        storageError={board.storageError}
        scrubbing={scrubbing}
      />

      {assetError ? (
        <div className="sbp-alert" role="alert">
          {assetError}
        </div>
      ) : null}

      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="board-photo-input"
        onChange={(event) => {
          void onPhotoPicked(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <input
        ref={sheetInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="board-sheet-input"
        onChange={(event) => {
          void onSheetPicked(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      <div className="sbp-board__body">
        <div className="sbp-board__main">
          <BoardCanvas
            doc={doc}
            viewport={viewport}
            setViewport={setViewport}
            tool={tool}
            onToolChange={setTool}
            color={color}
            selection={board.selection}
            setSelection={board.setSelection}
            selectedEdgeId={selectedEdgeId}
            setSelectedEdgeId={setSelectedEdgeId}
            dispatch={dispatch}
            assetUrl={assetUrl}
            onSizeChange={setSize}
            readOnly={scrubbing}
          />

          <BoardMinimap
            doc={doc}
            viewport={viewport}
            size={size}
            bookmarks={doc.bookmarks}
            onJumpTo={(world) => setViewport((prev) => centerOn(prev, world, size))}
            onRecallBookmark={(bookmark) => setViewport(bookmark.viewport)}
            onDeleteBookmark={(id) => dispatch({ type: "delete_bookmark", id }, { label: "Deleted bookmark" })}
            onSaveBookmark={(label) =>
              dispatch(
                { type: "add_bookmark", bookmark: createBookmark(label, viewport) },
                { label: `Saved view "${label}"` },
              )
            }
          />

          <GanttLane
            doc={doc}
            selection={board.selection}
            onSelect={board.setSelection}
            dispatch={dispatch}
            readOnly={scrubbing}
          />

          <TimeMachine
            history={board.history}
            scrubbing={scrubbing}
            onScrub={board.scrub}
            onRestore={board.commitScrub}
            onReturnToNow={board.cancelScrub}
          />
        </div>

        <aside className="sbp-board__aside">
          <NodeInspector
            doc={doc}
            selection={board.selection}
            selectedEdgeId={selectedEdgeId}
            dispatch={dispatch}
            readOnly={scrubbing}
            onDraftRfi={(nodeId) => setRfiNodeId(nodeId)}
          />
          <AssistantPanel
            doc={doc}
            projectName={projectName}
            preparedBy={preparedBy}
            rfiNodeId={rfiNodeId}
            onRfiNodeChange={setRfiNodeId}
          />
        </aside>
      </div>
    </div>
  );
}
