/**
 * history — the Time Machine slider, and undo/redo.
 *
 * Because `document.ts` only ever replaces the board with a new value, a history
 * is just the list of values it has held. The slider scrubs that list; undo and
 * redo step it by one. There is no per-action inverse to write and therefore no
 * action that can be added later and forget to supply one.
 *
 * ## Coalescing
 *
 * A drag fires an action per pointer move. Recording each as its own frame gives
 * a slider whose entire travel is one card sliding across a board, and an undo
 * that has to be pressed ninety times to take back one gesture. So frames carry
 * a `key` — "move:node_123" for a drag, null for a discrete edit — and a push
 * with the same key inside {@link COALESCE_WINDOW_MS} replaces the previous
 * frame instead of appending. One gesture, one frame.
 *
 * ## The cap is a ring
 *
 * Boards live in browser storage, and an unbounded history is how a long
 * planning session ends in a quota error mid-drag. {@link MAX_FRAMES} of history
 * is kept; older frames fall off the front. The *oldest surviving* frame is
 * therefore not the board's beginning, which the UI states rather than implying
 * the slider reaches back to a blank board.
 */

import type { BoardDoc } from "./types";

export const MAX_FRAMES = 60;
export const COALESCE_WINDOW_MS = 600;

export interface BoardFrame {
  doc: BoardDoc;
  /** Epoch milliseconds. Passed in, never read from the clock here. */
  at: number;
  /** Gesture identity for coalescing, or null for a discrete change. */
  key: string | null;
  /** Human summary shown beside the slider, e.g. "Moved 2 cards". */
  label: string;
}

export interface BoardHistory {
  frames: BoardFrame[];
  /** Index of the frame currently shown. Always a valid index into `frames`. */
  index: number;
  /** True once a frame has been dropped off the front. */
  truncated: boolean;
}

export function createHistory(doc: BoardDoc, at: number, label = "Opened"): BoardHistory {
  return { frames: [{ doc, at, key: null, label }], index: 0, truncated: false };
}

/** The board the history is currently pointing at. */
export function currentDoc(history: BoardHistory): BoardDoc {
  return history.frames[history.index].doc;
}

export interface PushOptions {
  key?: string | null;
  label?: string;
}

/**
 * Record a new state.
 *
 * Pushing after an undo discards the frames ahead of the cursor, which is the
 * standard branch-on-edit behaviour: a redo stack that survived an edit would
 * offer to jump forward to a board that no longer follows from this one.
 *
 * Pushing the identical document reference is a no-op — the reducer returns the
 * same object for an action that changed nothing, so this makes "don't record
 * empty frames" automatic rather than something every call site must check.
 */
export function pushFrame(
  history: BoardHistory,
  doc: BoardDoc,
  at: number,
  options: PushOptions = {},
): BoardHistory {
  const key = options.key ?? null;
  const label = options.label ?? "Edited";
  const current = history.frames[history.index];
  if (current && current.doc === doc) return history;

  const kept = history.frames.slice(0, history.index + 1);
  const last = kept[kept.length - 1];

  // Same gesture, still in the window: replace rather than append.
  if (last && key !== null && last.key === key && at - last.at <= COALESCE_WINDOW_MS) {
    const frames = kept.slice(0, -1);
    frames.push({ doc, at, key, label });
    return { ...history, frames, index: frames.length - 1 };
  }

  kept.push({ doc, at, key, label });
  let truncated = history.truncated;
  while (kept.length > MAX_FRAMES) {
    kept.shift();
    truncated = true;
  }
  return { frames: kept, index: kept.length - 1, truncated };
}

export function canUndo(history: BoardHistory): boolean {
  return history.index > 0;
}

export function canRedo(history: BoardHistory): boolean {
  return history.index < history.frames.length - 1;
}

export function undo(history: BoardHistory): BoardHistory {
  return canUndo(history) ? { ...history, index: history.index - 1 } : history;
}

export function redo(history: BoardHistory): BoardHistory {
  return canRedo(history) ? { ...history, index: history.index + 1 } : history;
}

/**
 * Scrub to an absolute frame — what the Time Machine slider calls.
 *
 * Out-of-range indices clamp instead of throwing. The slider's max and the
 * frame count can disagree for a render after a push, and a board that crashes
 * because a range input was one ahead of state would be a poor trade for a
 * bounds check.
 */
export function scrubTo(history: BoardHistory, index: number): BoardHistory {
  if (history.frames.length === 0) return history;
  const clamped = Math.max(0, Math.min(history.frames.length - 1, Math.round(index)));
  return clamped === history.index ? history : { ...history, index: clamped };
}

/**
 * Commit the scrubbed-to frame as the live board, dropping everything after it.
 *
 * Restoring is itself an edit — after it, "redo" should not offer to jump back
 * to the future the user has just rejected.
 */
export function restoreCurrent(history: BoardHistory): BoardHistory {
  if (!canRedo(history)) return history;
  const frames = history.frames.slice(0, history.index + 1);
  return { ...history, frames, index: frames.length - 1 };
}

/** Slider labels: one entry per frame, oldest first. */
export function frameSummaries(history: BoardHistory): Array<{ index: number; at: number; label: string }> {
  return history.frames.map((frame, index) => ({ index, at: frame.at, label: frame.label }));
}
