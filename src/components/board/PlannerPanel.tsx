/**
 * PlannerPanel — the spatial calendar: crews and vendors down, days across.
 *
 * Two things make it "spatial" rather than just another calendar. Cards are
 * dragged onto it from the board itself, so scheduling and planning happen on
 * one surface; and every chip that sits on a pinned card carries its sheet
 * number and can send the canvas to that spot — the plan and the job-site map
 * are the same document.
 *
 * ## Why HTML drag-and-drop is not used
 *
 * The board's canvas runs on Pointer Events, and iPad Safari does not fire HTML5
 * drag events for touch at all. A planner that only accepted a mouse drag would
 * be unusable on the device this whole feature is designed for. So a drop is a
 * two-step selection: pick up a card, tap a cell. That also survives a fat
 * finger better than a drag across a dense grid, and it is undoable in one step
 * because the assignment is a single dispatch.
 */

import { useState } from "react";
import type { BoardAction } from "@/lib/board/document";
import {
  UNASSIGNED_OWNER,
  assignmentActions,
  buildPlannerGrid,
  knownOwners,
  plannerLoad,
  plannerWeekStart,
  type PlannerItem,
} from "@/lib/board/planner";
import { addDaysIso } from "@/services/scheduleCascade";
import { todayIso } from "@/lib/board/timeline";
import type { BoardDoc } from "@/lib/board/types";

export interface PlannerPanelProps {
  doc: BoardDoc;
  dispatch: (action: BoardAction, options?: { key?: string; label?: string }) => void;
  /** Select a card and send the canvas to it. */
  onShowOnMap: (nodeId: string) => void;
  onSelect: (ids: string[]) => void;
  readOnly?: boolean;
}

/** One working week at a time: the horizon a weekly plan is actually built to. */
const VISIBLE_DAYS = 7;

export default function PlannerPanel({
  doc,
  dispatch,
  onShowOnMap,
  onSelect,
  readOnly = false,
}: PlannerPanelProps) {
  const today = todayIso();
  const [weekStart, setWeekStart] = useState<string>(() => plannerWeekStart(today) ?? today);
  const [carried, setCarried] = useState<string | null>(null);

  const grid = buildPlannerGrid(doc, weekStart, VISIBLE_DAYS);
  const load = plannerLoad(grid, today);
  const owners = knownOwners(doc);
  // The unowned row is always a valid drop target, so work can be planned before
  // anybody has been named for it.
  const dropRows = grid.rows.length > 0 ? grid.rows.map((r) => r.owner) : [...owners, UNASSIGNED_OWNER];
  const rowsToRender = grid.rows.length > 0 ? grid.rows : dropRows.map((owner) => ({ owner, cells: grid.days.map(() => [] as PlannerItem[]) }));

  const shiftWeek = (weeks: number) => {
    const next = addDaysIso(weekStart, weeks * 7);
    if (next) setWeekStart(next);
  };

  const drop = (owner: string, dateIso: string) => {
    if (!carried || readOnly) return;
    const actions = assignmentActions(doc, carried, owner, dateIso);
    for (const action of actions) {
      dispatch(action, { label: `Planned for ${owner || "nobody yet"} on ${dateIso}` });
    }
    setCarried(null);
  };

  const attentionFor = (owner: string) => load.find((entry) => entry.owner === owner);

  return (
    <div data-testid="board-planner">
      <h3 className="sbp-panel__title">Planner</h3>

      <div className="sbp-toolbar__group" style={{ marginBottom: 8 }}>
        <button type="button" className="sbp-btn sbp-btn--sm" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ‹
        </button>
        <button
          type="button"
          className="sbp-btn sbp-btn--sm"
          onClick={() => setWeekStart(plannerWeekStart(today) ?? today)}
        >
          This week
        </button>
        <button type="button" className="sbp-btn sbp-btn--sm" onClick={() => shiftWeek(1)} aria-label="Next week">
          ›
        </button>
      </div>

      {carried ? (
        <p className="sbp-empty" data-testid="board-planner-carrying">
          Tap a day to plan it. <button type="button" className="sbp-btn sbp-btn--sm" onClick={() => setCarried(null)}>Cancel</button>
        </p>
      ) : null}

      <div className="sbp-planner__scroll">
        <table className="sbp-planner">
          <thead>
            <tr>
              <th scope="col">Crew / vendor</th>
              {grid.days.map((day) => (
                <th
                  key={day.iso}
                  scope="col"
                  className={`${day.weekend ? "sbp-planner__weekend" : ""}${day.iso === today ? " sbp-planner__today" : ""}`}
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsToRender.length === 0 ? (
              <tr>
                <td colSpan={grid.days.length + 1} className="sbp-empty">
                  Nothing planned this week. Add a task or a delivery on the board, then pick it up below.
                </td>
              </tr>
            ) : null}
            {rowsToRender.map((row) => {
              const attention = attentionFor(row.owner);
              return (
                <tr key={row.owner || "__unowned"}>
                  <th scope="row">
                    {/* The unowned row is the planner's open question: scheduled,
                        and nobody doing it. Named as such rather than blank. */}
                    {row.owner || <em>Nobody assigned</em>}
                    {attention && attention.attention.length > 0 ? (
                      <span
                        className="sbp-card__pill sbp-card__pill--blocked"
                        data-testid={`board-planner-attention-${row.owner || "unowned"}`}
                      >
                        {attention.attention.length}
                      </span>
                    ) : null}
                  </th>
                  {grid.days.map((day, index) => (
                    <td
                      key={day.iso}
                      className={day.weekend ? "sbp-planner__weekend" : undefined}
                      data-testid={`board-planner-cell-${row.owner || "unowned"}-${day.iso}`}
                      onClick={() => drop(row.owner, day.iso)}
                    >
                      {(row.cells[index] ?? []).map((item) => (
                        <button
                          key={item.node_id}
                          type="button"
                          className={`sbp-chip${item.blocked ? " sbp-chip--blocked" : ""}${item.kind === "delivery" ? " sbp-chip--delivery" : ""}`}
                          title={item.sheet ? `${item.label} — ${item.sheet}` : item.label}
                          onClick={(event) => {
                            event.stopPropagation();
                            onShowOnMap(item.node_id);
                          }}
                        >
                          {item.label}
                          {item.sheet ? <span className="sbp-chip__sheet">{item.sheet}</span> : null}
                        </button>
                      ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4 className="sbp-panel__title" style={{ marginTop: 12 }}>
        Needs a date
      </h4>
      {grid.unassigned.length === 0 ? (
        <p className="sbp-empty">Everything on the board has a date.</p>
      ) : (
        <div className="sbp-planner__tray" data-testid="board-planner-tray">
          {grid.unassigned.map((item) => (
            <button
              key={item.node_id}
              type="button"
              className={`sbp-btn sbp-btn--sm${carried === item.node_id ? " sbp-btn--active" : ""}`}
              disabled={readOnly}
              onClick={() => {
                setCarried(carried === item.node_id ? null : item.node_id);
                onSelect([item.node_id]);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
