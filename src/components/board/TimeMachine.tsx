/**
 * TimeMachine — scrub the board back through its own history.
 *
 * While the slider is off the newest frame the board is **read-only**: the
 * canvas is showing the past, and an edit made there would either be lost on the
 * next scrub or silently branch the history without the user having asked to.
 * So the board says it is showing an older version and offers two ways out —
 * restore it, or return to now.
 */

import { frameSummaries, type BoardHistory } from "@/lib/board/history";
import { MAX_FRAMES } from "@/lib/board/history";

export interface TimeMachineProps {
  history: BoardHistory;
  scrubbing: boolean;
  onScrub: (index: number) => void;
  onRestore: () => void;
  onReturnToNow: () => void;
}

export default function TimeMachine({ history, scrubbing, onScrub, onRestore, onReturnToNow }: TimeMachineProps) {
  const frames = frameSummaries(history);
  const active = frames[history.index];
  const newest = history.index === frames.length - 1;

  return (
    <div className={`sbp-time${scrubbing ? " sbp-time--scrubbing" : ""}`} data-testid="board-time-machine">
      <span>Time machine</span>
      <input
        type="range"
        min={0}
        max={Math.max(0, frames.length - 1)}
        step={1}
        value={history.index}
        aria-label="Board history"
        onChange={(event) => onScrub(Number(event.target.value))}
      />
      <span data-testid="board-time-label">
        {newest ? "Now" : `${active?.label ?? "Earlier"} · ${formatTime(active?.at)}`}
      </span>
      {scrubbing ? (
        <>
          <button type="button" className="sbp-btn sbp-btn--sm" onClick={onRestore}>
            Restore this version
          </button>
          <button type="button" className="sbp-btn sbp-btn--sm" onClick={onReturnToNow}>
            Back to now
          </button>
        </>
      ) : null}
      {history.truncated ? (
        // Said plainly: the oldest frame the slider reaches is not the board's
        // beginning, and a user who scrubs to the left end should not think it is.
        <span title={`Only the last ${MAX_FRAMES} changes are kept on this device.`}>
          (last {MAX_FRAMES} changes)
        </span>
      ) : null}
    </div>
  );
}

function formatTime(at: number | undefined): string {
  if (typeof at !== "number") return "";
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
