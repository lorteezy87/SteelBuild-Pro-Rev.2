/**
 * GanttLane — the touch timeline.
 *
 * Three gestures, each mapped to exactly one date change by `lib/board/timeline`:
 * drag a bar to move it (duration held), drag an end grip to extend it (the
 * other end held), pinch a bar to stretch it about its start. Nothing here does
 * date arithmetic — it converts pointer deltas into calls and applies whatever
 * comes back.
 *
 * Unscheduled tasks sit in a tray under the lane rather than on it. Tapping a
 * day column with one selected schedules it as a one-day task: the tap said
 * *when*, not *how long*.
 */

import { useRef, useState } from "react";
import type { BoardAction } from "@/lib/board/document";
import {
  clampPxPerDay,
  dragBar,
  pinchBar,
  resizeBarEnd,
  resizeBarStart,
  scheduleAt,
  scheduledTasks,
  sequenceViolations,
  taskBar,
  timelineRange,
  timelineTicks,
  todayIso,
  type DatePair,
  type TimelineScale,
} from "@/lib/board/timeline";
import { boardFill, boardStroke } from "@/lib/board/palette";
import { dateToX } from "@/lib/board/timeline";
import type { BoardDoc, BoardTaskNode } from "@/lib/board/types";
import { unscheduledTasks } from "@/lib/board/timeline";

export interface GanttLaneProps {
  doc: BoardDoc;
  selection: string[];
  onSelect: (ids: string[]) => void;
  dispatch: (action: BoardAction, options?: { key?: string; label?: string }) => void;
  readOnly?: boolean;
}

const ROW_HEIGHT = 38;
const HEADER_HEIGHT = 18;

type BarGesture =
  | { kind: "move"; nodeId: string }
  | { kind: "start"; nodeId: string }
  | { kind: "end"; nodeId: string };

export default function GanttLane({ doc, selection, onSelect, dispatch, readOnly = false }: GanttLaneProps) {
  const [pxPerDay, setPxPerDay] = useState(24);
  const gesture = useRef<BarGesture | null>(null);
  const originX = useRef(0);
  const anchorDates = useRef<DatePair | null>(null);

  const range = timelineRange(doc);
  const tasks = scheduledTasks(doc);
  const unscheduled = unscheduledTasks(doc);
  const violations = sequenceViolations(doc);
  const violatingIds = new Set(violations.flatMap((v) => [v.predecessor_id, v.successor_id]));

  const scale: TimelineScale = { origin: range?.start ?? todayIso(), pxPerDay };
  const width = (range?.days ?? 30) * pxPerDay;
  const todayX = dateToX(scale, todayIso());

  const applyDates = (task: BoardTaskNode, dates: DatePair | null) => {
    if (!dates) return;
    dispatch(
      { type: "update_task", id: task.id, patch: dates },
      { key: `schedule:${task.id}`, label: "Rescheduled task" },
    );
  };

  const onBarPointerDown = (
    event: React.PointerEvent<HTMLElement>,
    task: BoardTaskNode,
    kind: BarGesture["kind"],
  ) => {
    if (readOnly) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { kind, nodeId: task.id };
    originX.current = event.clientX;
    anchorDates.current = { start_date: task.start_date ?? "", end_date: task.end_date ?? "" };
    onSelect([task.id]);
  };

  const onBarPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    const anchor = anchorDates.current;
    if (!active || !anchor) return;
    const task = doc.nodes.find((n) => n.id === active.nodeId);
    if (!task || task.kind !== "task") return;
    // Measured from where the gesture started against the dates it started
    // with, so a slow drag does not accumulate rounding a day at a time.
    const from: BoardTaskNode = { ...task, ...anchor };
    const dx = event.clientX - originX.current;
    if (active.kind === "move") applyDates(task, dragBar(scale, from, dx));
    if (active.kind === "start") applyDates(task, resizeBarStart(scale, from, dx));
    if (active.kind === "end") applyDates(task, resizeBarEnd(scale, from, dx));
  };

  const onBarPointerUp = () => {
    gesture.current = null;
    anchorDates.current = null;
  };

  return (
    <div className="sbp-lane" data-testid="board-gantt-lane">
      <div className="sbp-lane__head">
        <strong>Timeline</strong>
        <span>{tasks.length} scheduled</span>
        {violations.length > 0 ? (
          <span className="sbp-card__pill sbp-card__pill--blocked" data-testid="board-sequence-warning">
            {violations.length} sequence conflict{violations.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            type="button"
            className="sbp-btn sbp-btn--sm"
            aria-label="Zoom timeline out"
            onClick={() => setPxPerDay((prev) => clampPxPerDay(prev / 1.5))}
          >
            −
          </button>
          <button
            type="button"
            className="sbp-btn sbp-btn--sm"
            aria-label="Zoom timeline in"
            onClick={() => setPxPerDay((prev) => clampPxPerDay(prev * 1.5))}
          >
            +
          </button>
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="sbp-empty" style={{ padding: 14 }}>
          No task on this board has both a start and a finish yet. Give one dates in the inspector, or
          select an unscheduled task below and tap the lane.
        </div>
      ) : (
        <div className="sbp-lane__scroll">
          <div
            className="sbp-lane__grid"
            style={{ width, height: HEADER_HEIGHT + tasks.length * ROW_HEIGHT + 8 }}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
            onPointerCancel={onBarPointerUp}
            onClick={(event) => {
              if (readOnly) return;
              const selected = doc.nodes.find((n) => n.id === selection[0]);
              if (!selected || selected.kind !== "task" || (selected.start_date && selected.end_date)) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              applyDates(selected, scheduleAt(scale, event.clientX - bounds.left));
            }}
          >
            {timelineTicks(scale, width).map((tick) => (
              <div key={tick.iso}>
                <div
                  className={`sbp-lane__tick${tick.monthStart ? " sbp-lane__tick--month" : ""}`}
                  style={{ left: tick.x }}
                />
                <span className="sbp-lane__ticklabel" style={{ left: tick.x + 3 }}>
                  {tick.label}
                </span>
              </div>
            ))}

            {todayX !== null && todayX >= 0 && todayX <= width ? (
              <div className="sbp-lane__today" style={{ left: todayX }} title="Today" />
            ) : null}

            {tasks.map((task, row) => {
              const bar = taskBar(scale, task);
              if (!bar) return null;
              const selected = selection.includes(task.id);
              return (
                <div
                  key={task.id}
                  className={`sbp-bar${selected ? " sbp-bar--selected" : ""}${task.blocked || violatingIds.has(task.id) ? " sbp-bar--blocked" : ""}`}
                  data-testid={`board-bar-${task.id}`}
                  style={{
                    left: bar.x,
                    top: HEADER_HEIGHT + row * ROW_HEIGHT,
                    width: Math.max(24, bar.width),
                    background: boardFill(task.color),
                    borderLeft: `4px solid ${boardStroke(task.color)}`,
                  }}
                  onPointerDown={(event) => onBarPointerDown(event, task, "move")}
                >
                  <span
                    className="sbp-bar__grip sbp-bar__grip--start"
                    data-testid={`board-bar-start-${task.id}`}
                    onPointerDown={(event) => onBarPointerDown(event, task, "start")}
                  />
                  {task.text || "Untitled task"} · {bar.days}d
                  <span
                    className="sbp-bar__grip sbp-bar__grip--end"
                    data-testid={`board-bar-end-${task.id}`}
                    onPointerDown={(event) => onBarPointerDown(event, task, "end")}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 ? (
        <div className="sbp-lane__tray" data-testid="board-unscheduled-tray">
          <span className="sbp-empty">Not scheduled:</span>
          {unscheduled.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`sbp-btn sbp-btn--sm${selection.includes(task.id) ? " sbp-btn--active" : ""}`}
              onClick={() => onSelect([task.id])}
            >
              {task.text || "Untitled task"}
            </button>
          ))}
          <PinchHint />
        </div>
      ) : null}
    </div>
  );
}

/** One line of instruction, because a pinch on a bar is not discoverable. */
function PinchHint() {
  return <span className="sbp-empty">Drag a bar to move it, its ends to extend it.</span>;
}

/** Exported for the page's pinch handler on a selected bar. */
export function pinchSelectedBar(task: BoardTaskNode, prevDistance: number, nextDistance: number): DatePair | null {
  return pinchBar(task, prevDistance, nextDistance);
}
