/**
 * useBoardController — the board page's state, in one hook.
 *
 * The page component below it is presentation: it renders whatever this hook
 * reports and calls back into it. Everything that decides *what the board is* —
 * the reducer, the history, persistence, the sync state — lives here, so the
 * canvas, the minimap, the Gantt lane and the assistant panel all read one
 * source of truth instead of each keeping a copy.
 *
 * ## Dispatch is the only way in
 *
 * `dispatch` applies the action, records a history frame, queues the change for
 * sync and schedules a save. Any of those steps done separately at a call site
 * is a way for the four to drift — a card that moves on screen but is not saved,
 * or is saved but never queued.
 *
 * ## Scrubbing the Time Machine does not overwrite the board
 *
 * While the slider is being dragged the board *shown* is a past frame, but
 * nothing is saved and nothing is queued. Only `commitScrub` makes that frame
 * the live board. Persisting each scrubbed frame would mean dragging the slider
 * to look at last Tuesday silently reverted the board on the next save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyBoardAction, createBoardDoc, type BoardAction } from "@/lib/board/document";
import { newId, nowIso } from "@/lib/board/factory";
import {
  createHistory,
  currentDoc,
  pushFrame,
  redo as redoHistory,
  restoreCurrent,
  scrubTo,
  undo as undoHistory,
  type BoardHistory,
} from "@/lib/board/history";
import {
  enqueue,
  listBoards,
  loadBoard,
  localOnlyAdapter,
  saveBoard,
  storageErrorMessage,
  syncBoard,
  type BoardSyncAdapter,
  type SyncState,
} from "@/lib/board/storage";
import { DEFAULT_VIEWPORT, type Viewport } from "@/lib/board/viewport";
import type { BoardDoc } from "@/lib/board/types";

/** How long after the last change the board is written to storage. */
const SAVE_DEBOUNCE_MS = 400;

export interface DispatchOptions {
  /** Gesture identity, so a drag records one history frame rather than ninety. */
  key?: string;
  /** What the slider shows for this frame. */
  label?: string;
}

export interface BoardControllerOptions {
  projectId: string | null;
  /** Injected in tests; defaults to the local-only adapter. */
  adapter?: BoardSyncAdapter;
}

export interface BoardController {
  doc: BoardDoc;
  dispatch: (action: BoardAction, options?: DispatchOptions) => void;
  history: BoardHistory;
  /** True while the slider is showing a frame that is not the newest. */
  scrubbing: boolean;
  scrub: (index: number) => void;
  commitScrub: () => void;
  cancelScrub: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  viewport: Viewport;
  setViewport: (next: Viewport | ((prev: Viewport) => Viewport)) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  sync: SyncState;
  /** Set when the last save failed. The page shows it; it must not be swallowed. */
  storageError: string | null;
  online: boolean;
  syncNow: () => void;
}

/**
 * The board id for a project.
 *
 * One board per project for now, discovered through the local index so a
 * returning user reopens the board they were on rather than a fresh one. A
 * project with several boards is a later feature; the storage layer already
 * lists them.
 */
function resolveBoardId(projectId: string | null): string {
  if (!projectId) return "board_portfolio";
  const known = listBoards(projectId);
  return known[0]?.board_id ?? `board_${projectId}`;
}

export function useBoardController(options: BoardControllerOptions): BoardController {
  const { projectId } = options;
  const adapter = options.adapter ?? localOnlyAdapter;

  const [history, setHistory] = useState<BoardHistory>(() => {
    const boardId = resolveBoardId(projectId);
    const loaded = loadBoard(boardId);
    const doc = loaded ?? createBoardDoc(boardId, projectId, "Command board", nowIso());
    return createHistory(doc, Date.now(), loaded ? "Opened" : "New board");
  });

  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [selection, setSelection] = useState<string[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  const [sync, setSync] = useState<SyncState>({
    status: "pending",
    pending: 0,
    last_synced_at: null,
    message: "Not synced yet.",
  });

  const doc = currentDoc(history);
  const scrubbing = history.index < history.frames.length - 1;

  // Reload when the project changes. Boards are per-project; carrying one
  // project's cards into another would be worse than an empty canvas.
  const projectRef = useRef(projectId);
  useEffect(() => {
    if (projectRef.current === projectId) return;
    projectRef.current = projectId;
    const boardId = resolveBoardId(projectId);
    const loaded = loadBoard(boardId);
    const next = loaded ?? createBoardDoc(boardId, projectId, "Command board", nowIso());
    setHistory(createHistory(next, Date.now(), loaded ? "Opened" : "New board"));
    setSelection([]);
    setViewport(DEFAULT_VIEWPORT);
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Saving ───────────────────────────────────────────────────────────────
  //
  // Debounced, and deliberately keyed on the *live* document rather than the
  // scrubbed one: looking at history must not rewrite the board.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDoc = history.frames[history.frames.length - 1]?.doc ?? doc;

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setStorageError(storageErrorMessage(saveBoard(liveDoc)));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [liveDoc]);

  const dispatch = useCallback(
    (action: BoardAction, dispatchOptions: DispatchOptions = {}) => {
      setHistory((prev) => {
        const base = currentDoc(prev);
        const next = applyBoardAction(base, action, nowIso());
        // The reducer returns the same reference for an action that changed
        // nothing — no frame, no queue entry, no save.
        if (next === base) return prev;
        const queued = enqueue({
          id: newId("chg"),
          board_id: next.id,
          base_rev: base.rev,
          action,
          queued_at: nowIso(),
        });
        const queueError = storageErrorMessage(queued);
        if (queueError) setStorageError(queueError);
        return pushFrame(prev, next, Date.now(), {
          key: dispatchOptions.key ?? null,
          label: dispatchOptions.label ?? "Edited",
        });
      });
    },
    [],
  );

  const scrub = useCallback((index: number) => {
    setHistory((prev) => scrubTo(prev, index));
  }, []);

  const commitScrub = useCallback(() => {
    setHistory((prev) => restoreCurrent(prev));
  }, []);

  const cancelScrub = useCallback(() => {
    setHistory((prev) => scrubTo(prev, prev.frames.length - 1));
  }, []);

  const undo = useCallback(() => setHistory((prev) => undoHistory(prev)), []);
  const redo = useCallback(() => setHistory((prev) => redoHistory(prev)), []);

  const syncNow = useCallback(() => {
    let cancelled = false;
    void syncBoard(liveDoc, adapter, { online, now: nowIso() }).then((state) => {
      if (!cancelled) setSync(state);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, liveDoc, online]);

  // Re-check sync whenever the board changes or connectivity flips. With the
  // local-only adapter this is what keeps the status line honest about how much
  // work is sitting on the device.
  useEffect(() => {
    let cancelled = false;
    void syncBoard(liveDoc, adapter, { online, now: nowIso() }).then((state) => {
      if (!cancelled) setSync(state);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, liveDoc, online]);

  // Selection can outlive the nodes it names — undo, a scrub, another device.
  // Pruning here means no consumer has to defend against a selected id that
  // resolves to nothing.
  const prunedSelection = useMemo(
    () => selection.filter((id) => doc.nodes.some((node) => node.id === id)),
    [selection, doc.nodes],
  );

  return {
    doc,
    dispatch,
    history,
    scrubbing,
    scrub,
    commitScrub,
    cancelScrub,
    undo,
    redo,
    canUndo: history.index > 0,
    canRedo: history.index < history.frames.length - 1,
    viewport,
    setViewport,
    selection: prunedSelection,
    setSelection,
    sync,
    storageError,
    online,
    syncNow,
  };
}
